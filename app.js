import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// Import our game modules
import { initializeAudio, setupInstruments } from './audio.js';
import { loadModels, createWorld } from './world.js';
import { setupNetwork, updatePlayerState, setRoomReference } from './network.js';
import { isMobile, setupMobileControls, setupDesktopControls, updatePlayerMovement } from './controls.js';

// Global references
let camera, scene, renderer, composer;
let controls;
let world;
let player;
let audioSystem;
let networkSystem;
let animationFrame;
let clock = new THREE.Clock();
let isWorldReady = false;
let loadingManager;
let isFirstPerson = true; // Default to first-person view

// Initialize the application
async function init() {
  setupLoadingManager();
  setupThreeJs();
  setupPostProcessing();
  
  try {
    // Initialize network first, but don't trigger callbacks yet
    networkSystem = await setupNetwork(onNetworkReady, onPlayerJoin, onPlayerLeave, onPlayerUpdate);
    
    // Initialize audio system after network
    audioSystem = await initializeAudio();
    audioSystem.setNetworkSystem(networkSystem);
    
    // Setup UI event listeners
    setupUIControls();
    
    // Start loading world assets
    world = await createWorld(scene, loadingManager);
    
    // Now that the world is ready, we can trigger the network ready callback
    networkSystem.triggerReady();
    
    // Start the render loop
    clock.start();
    animate();
    
    // Hide loading screen once everything is ready
    document.getElementById('loading-screen').style.display = 'none';
    isWorldReady = true;
  } catch (err) {
    console.error("Error during initialization:", err);
    document.getElementById('loading-text').textContent = `Error: ${err.message}. Try refreshing the page.`;
  }
}

function setupLoadingManager() {
  loadingManager = new THREE.LoadingManager();
  
  loadingManager.onProgress = function(url, loaded, total) {
    const progress = (loaded / total) * 100;
    document.getElementById('loading-progress').style.width = progress + '%';
    document.getElementById('loading-text').textContent = `Loading: ${Math.round(progress)}%`;
  };
}

function setupThreeJs() {
  // Create the scene
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.002);
  
  // Create the camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 5);
  
  // Create the renderer
  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('world-canvas'),
    antialias: true
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  
  // Set up camera controls for third-person view
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 1;
  controls.maxDistance = 50;
  controls.maxPolarAngle = Math.PI / 2;
  controls.enabled = !isFirstPerson; // Disable when in first-person mode
  
  // Add ambient light
  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);
  
  // Add directional light (sun)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(0, 10, 0);
  directionalLight.castShadow = true;
  scene.add(directionalLight);
  
  // Add environment map for reflections
  new RGBELoader(loadingManager)
    .setPath('https://threejs.org/examples/textures/equirectangular/')
    .load('royal_esplanade_1k.hdr', function(texture) {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
      scene.background = new THREE.Color(0x060818);
    });
    
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
  
  // Add a key listener for switching between first and third person
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') {
      toggleViewMode();
    }
  });
}

function toggleViewMode() {
  isFirstPerson = !isFirstPerson;
  controls.enabled = !isFirstPerson;
  
  if (isFirstPerson) {
    // First-person: camera moves with player
    camera.position.set(0, 1.6, 0);
    camera.rotation.set(0, 0, 0);
  } else {
    // Third-person: orbit controls take over
    controls.target.copy(player.position);
    camera.position.set(
      player.position.x + 5,
      player.position.y + 5,
      player.position.z + 5
    );
  }
}

function setupPostProcessing() {
  // Create composer for post-processing effects
  composer = new EffectComposer(renderer);
  
  // Add standard render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  
  // Add FXAA anti-aliasing pass
  const fxaaPass = new ShaderPass(FXAAShader);
  const pixelRatio = renderer.getPixelRatio();
  fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
  fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
  composer.addPass(fxaaPass);
  
  // Add bloom effect for glow
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.5,  // strength
    0.4,  // radius
    0.85  // threshold
  );
  composer.addPass(bloomPass);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  
  const pixelRatio = renderer.getPixelRatio();
  const fxaaPass = composer.passes[1];
  fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * pixelRatio);
  fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * pixelRatio);
}

function setupUIControls() {
  // Initialize click handler to start audio context
  document.body.addEventListener('click', async () => {
    // Audio context will be started by audioSystem when needed
  }, { once: true });

  // Instrument panel toggle
  document.getElementById('instrument-btn').addEventListener('click', () => {
    document.getElementById('instrument-panel').classList.toggle('hidden');
  });
  
  // Close panel button
  document.getElementById('close-panel').addEventListener('click', () => {
    document.getElementById('instrument-panel').classList.add('hidden');
  });
  
  // Play button
  document.getElementById('play-btn').addEventListener('click', (e) => {
    if (e.target.textContent === 'Start Playing') {
      audioSystem.startPlayback();
      e.target.textContent = 'Stop Playing';
      e.target.classList.add('btn-danger');
      e.target.classList.remove('btn-primary');
    } else {
      audioSystem.stopPlayback();
      e.target.textContent = 'Start Playing';
      e.target.classList.add('btn-primary');
      e.target.classList.remove('btn-danger');
    }
  });
  
  // Volume control
  document.getElementById('volume').addEventListener('input', (e) => {
    const volume = parseInt(e.target.value) / 100;
    audioSystem.setVolume(volume);
    networkSystem.updatePresence({ volume });
  });
  
  // Tempo control
  document.getElementById('tempo').addEventListener('input', (e) => {
    const tempo = parseInt(e.target.value);
    document.getElementById('tempo-value').textContent = `${tempo} BPM`;
    audioSystem.setTempo(tempo);
    networkSystem.updateRoomState({ tempo });
  });
  
  // Clear notes button
  document.getElementById('clear-btn').addEventListener('click', () => {
    audioSystem.clearNotes();
    document.querySelectorAll('.grid-cell.active').forEach(cell => {
      cell.classList.remove('active');
      cell.style.backgroundColor = '';
    });
    networkSystem.updatePresence({ activeNotes: {} });
  });
  
  // Add info text about controls
  const roomInfo = document.getElementById('room-info');
  const controlsInfo = document.createElement('div');
  controlsInfo.innerHTML = `
    <div style="margin-top: 5px; font-size: 0.8rem;">
      Controls: WASD to move, E to interact, Space to jump, V to toggle view
    </div>
  `;
  roomInfo.appendChild(controlsInfo);
}

function onNetworkReady(roomInfo) {
  // Make sure world is created before using it
  if (!world) {
    console.error("World not initialized yet!");
    return;
  }
  
  const infoElement = document.getElementById('room-info');
  infoElement.textContent = `Welcome, ${roomInfo.username}!`;
  
  // Create player entity
  player = world.createPlayer(roomInfo.clientId, roomInfo.username);
  
  // Set up initial player state in network
  updatePlayerState(player.position, player.rotation);
  
  // Initialize grid based on room state
  audioSystem.setupGrid(document.getElementById('grid'), networkSystem.getClientColor());
  updateParticipantsList();
  
  // Create instrument list
  setupInstrumentList();
  
  // Set up controls based on device
  if (isMobile()) {
    setupMobileControls(player, camera, world, audioSystem);
  } else {
    setupDesktopControls(player, camera, world, audioSystem);
  }
}

function setupInstrumentList() {
  const instrumentList = document.getElementById('instrument-list');
  const instrumentTypes = setupInstruments().INSTRUMENT_TYPES;
  
  instrumentList.innerHTML = '';
  
  instrumentTypes.forEach(type => {
    const item = document.createElement('div');
    item.className = 'instrument-item';
    item.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    
    if (type === 'synth') {
      item.classList.add('active');
    }
    
    item.addEventListener('click', () => {
      document.querySelectorAll('.instrument-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      audioSystem.setCurrentInstrument(type);
    });
    
    instrumentList.appendChild(item);
  });
}

function onPlayerJoin(clientId, username) {
  console.log(`${username} joined the world`);
  world.createRemotePlayer(clientId, username);
  updateParticipantsList();
}

function onPlayerLeave(clientId, username) {
  console.log(`${username} left the world`);
  world.removePlayer(clientId);
  updateParticipantsList();
}

function onPlayerUpdate(clientId, data) {
  // Add safety checks for world and networkSystem
  if (!world || !networkSystem) return;
  
  try {
    if (clientId !== networkSystem.getClientId()) {
      world.updateRemotePlayer(clientId, data);
    }
  } catch (err) {
    console.warn("Error updating remote player:", err);
  }
}

function updateParticipantsList() {
  const participantsElement = document.getElementById('participants');
  participantsElement.innerHTML = '';
  
  const peers = networkSystem.getPeers();
  const clientId = networkSystem.getClientId();
  const presence = networkSystem.getPresence();
  
  Object.keys(peers).forEach(peerId => {
    const peer = peers[peerId];
    const peerPresence = presence[peerId] || {};
    
    const participantElement = document.createElement('div');
    participantElement.className = 'participant';
    
    if (peerId === clientId) {
      participantElement.classList.add('self');
    }
    
    participantElement.innerHTML = `
      <div class="participant-avatar" style="background-color: ${peerPresence.color || '#6c5ce7'}">
        <img src="${peer.avatarUrl}" alt="${peer.username}">
      </div>
      <div>
        <div class="participant-name">${peer.username}</div>
        <div class="participant-instrument">${peerPresence.instrument || 'exploring'}</div>
      </div>
    `;
    
    participantsElement.appendChild(participantElement);
  });
}

function animate() {
  animationFrame = requestAnimationFrame(animate);
  
  const delta = clock.getDelta();
  
  // Update controls
  if (!isFirstPerson) {
    controls.update();
  }
  
  // Update player movement for desktop
  if (player && isWorldReady && !isMobile()) {
    updatePlayerMovement(player, camera, delta);
  }
  
  // Update world entities
  if (isWorldReady && world) {
    world.update(delta);
  }
  
  // Update camera position for first-person mode
  if (isFirstPerson && player) {
    camera.position.set(
      player.position.x,
      player.position.y + 1.6,
      player.position.z
    );
    camera.quaternion.copy(player.quaternion);
  } else if (!isFirstPerson && player) {
    // Update orbit controls target to follow player
    controls.target.copy(player.position);
  }
  
  // Update network with player position if changed
  if (player && isWorldReady) {
    updatePlayerState(player.position, player.rotation);
  }
  
  // Render the scene with post-processing
  composer.render();
}

// Start the application
init();