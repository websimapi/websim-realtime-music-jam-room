import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';

// Instrument models and positions in the world
const INSTRUMENTS = {
  'synth': {
    model: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF/Box.gltf',
    scale: 1.0,
    position: new THREE.Vector3(10, 0, 5),
    color: 0x6c5ce7
  },
  'piano': {
    model: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF/Box.gltf',
    scale: 2.0,
    position: new THREE.Vector3(-10, 0, -5),
    color: 0xfd79a8
  },
  'drum': {
    model: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF/Box.gltf',
    scale: 1.5,
    position: new THREE.Vector3(0, 0, 15),
    color: 0xfdcb6e
  },
  'guitar': {
    model: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF/Box.gltf',
    scale: 1.2,
    position: new THREE.Vector3(15, 0, -10),
    color: 0x00b894
  },
  'flute': {
    model: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF/Box.gltf',
    scale: 0.8,
    position: new THREE.Vector3(-15, 0, 10),
    color: 0x74b9ff
  }
};

// Random floating islands data
const ISLANDS = [
  { position: new THREE.Vector3(0, -1, 0), radius: 20, height: 2 },
  { position: new THREE.Vector3(30, 1, 20), radius: 15, height: 3 },
  { position: new THREE.Vector3(-25, 0, -30), radius: 12, height: 2 },
  { position: new THREE.Vector3(-20, 2, 35), radius: 10, height: 1.5 },
  { position: new THREE.Vector3(40, -2, -15), radius: 8, height: 1 }
];

export async function loadModels(loadingManager) {
  const loader = new GLTFLoader(loadingManager);
  const instrumentModels = {};
  
  // Load all instrument models
  const loadPromises = Object.keys(INSTRUMENTS).map(instrumentType => {
    return new Promise((resolve, reject) => {
      loader.load(INSTRUMENTS[instrumentType].model, (gltf) => {
        instrumentModels[instrumentType] = gltf.scene;
        resolve();
      }, undefined, reject);
    });
  });
  
  await Promise.all(loadPromises);
  return instrumentModels;
}

export async function createWorld(scene, loadingManager) {
  // Load instrument models
  const instrumentModels = await loadModels(loadingManager);
  
  // Create floating islands
  createFloatingIslands(scene);
  
  // Create water
  const water = createWater(scene);
  
  // Create sky
  const sky = createSky(scene);
  
  // Add instruments to the world
  placeInstruments(scene, instrumentModels);
  
  // Add ambient particles
  createAmbientParticles(scene);
  
  // Players container
  const players = {};
  
  // Return world API
  return {
    scene,
    water,
    sky,
    players,
    
    update(delta) {
      // Update water animation
      water.material.uniforms['time'].value += delta * 0.5;
      
      // Update players
      Object.values(players).forEach(player => {
        if (player.mixer) {
          player.mixer.update(delta);
        }
      });
    },
    
    createPlayer(clientId, username) {
      const player = new THREE.Group();
      
      // Create a simple avatar
      const geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
      const material = new THREE.MeshStandardMaterial({ color: 0x6c5ce7 });
      const body = new THREE.Mesh(geometry, material);
      body.position.y = 1;
      
      // Add name tag
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      context.fillStyle = '#000000';
      context.fillRect(0, 0, 256, 64);
      context.font = '24px Arial';
      context.fillStyle = '#ffffff';
      context.textAlign = 'center';
      context.fillText(username, 128, 40);
      
      const nameTexture = new THREE.CanvasTexture(canvas);
      const nameMaterial = new THREE.SpriteMaterial({ map: nameTexture });
      const nameSprite = new THREE.Sprite(nameMaterial);
      nameSprite.position.y = 2.5;
      nameSprite.scale.set(2, 0.5, 1);
      
      player.add(body);
      player.add(nameSprite);
      player.position.set(0, 0, 0);
      
      scene.add(player);
      players[clientId] = player;
      
      return player;
    },
    
    createRemotePlayer(clientId, username) {
      return this.createPlayer(clientId, username);
    },
    
    updateRemotePlayer(clientId, data) {
      const player = players[clientId];
      if (player) {
        if (data.position) {
          player.position.set(data.position.x, data.position.y, data.position.z);
        }
        
        if (data.rotation) {
          player.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
        }
      }
    },
    
    removePlayer(clientId) {
      const player = players[clientId];
      if (player) {
        scene.remove(player);
        delete players[clientId];
      }
    },
    
    // Get the nearest instrument to a position
    getNearestInstrument(position, maxDistance = 5) {
      let nearestInstrument = null;
      let minDistance = maxDistance;
      
      Object.keys(INSTRUMENTS).forEach(type => {
        const instrumentPos = INSTRUMENTS[type].position;
        const distance = position.distanceTo(instrumentPos);
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestInstrument = type;
        }
      });
      
      return nearestInstrument;
    }
  };
}

function createFloatingIslands(scene) {
  // Create islands
  ISLANDS.forEach(island => {
    // Main island geometry
    const geometry = new THREE.CylinderGeometry(
      island.radius,
      island.radius * 1.2,
      island.height,
      32,
      1,
      false
    );
    
    const material = new THREE.MeshStandardMaterial({
      color: 0x4b6584,
      roughness: 0.8,
      metalness: 0.2
    });
    
    const islandMesh = new THREE.Mesh(geometry, material);
    islandMesh.position.copy(island.position);
    
    // Add some vegetation (simple cones)
    const treeCount = Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i < treeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * (island.radius * 0.8);
      
      const treeGeometry = new THREE.ConeGeometry(1, 3, 8);
      const treeMaterial = new THREE.MeshStandardMaterial({
        color: 0x26de81,
        roughness: 1.0
      });
      
      const tree = new THREE.Mesh(treeGeometry, treeMaterial);
      tree.position.set(
        Math.cos(angle) * radius,
        island.height / 2 + 1.5,
        Math.sin(angle) * radius
      );
      
      islandMesh.add(tree);
    }
    
    // Add the island to the scene
    scene.add(islandMesh);
  });
}

function createWater(scene) {
  const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
  const water = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load(
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg',
      function(texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      }
    ),
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: 0xffffff,
    waterColor: 0x001e0f,
    distortionScale: 3.7,
    fog: scene.fog !== undefined
  });
  
  water.rotation.x = -Math.PI / 2;
  water.position.y = -5;
  scene.add(water);
  
  return water;
}

function createSky(scene) {
  const sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);
  
  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 10;
  skyUniforms['rayleigh'].value = 2;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.8;
  
  const sun = new THREE.Vector3();
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  
  // Set sun position
  const phi = THREE.MathUtils.degToRad(88);
  const theta = THREE.MathUtils.degToRad(180);
  sun.setFromSphericalCoords(1, phi, theta);
  
  sky.material.uniforms['sunPosition'].value.copy(sun);
  
  return sky;
}

function placeInstruments(scene, instrumentModels) {
  Object.keys(INSTRUMENTS).forEach(type => {
    const data = INSTRUMENTS[type];
    const model = instrumentModels[type].clone();
    
    // Set position and scale
    model.position.copy(data.position);
    model.scale.set(data.scale, data.scale, data.scale);
    
    // Add glowing material to make instruments stand out
    model.traverse(child => {
      if (child.isMesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: data.color,
          emissive: data.color,
          emissiveIntensity: 0.3,
          roughness: 0.3,
          metalness: 0.7
        });
      }
    });
    
    // Add floating animation
    const yPosition = model.position.y;
    model.userData.animation = {
      update: (delta) => {
        model.position.y = yPosition + Math.sin(Date.now() * 0.001) * 0.5;
        model.rotation.y += delta * 0.3;
      }
    };
    
    // Add to scene
    scene.add(model);
    
    // Add a spotlight to highlight the instrument
    const spotlight = new THREE.SpotLight(data.color, 2, 10, Math.PI / 6, 0.5, 1);
    spotlight.position.set(data.position.x, data.position.y + 5, data.position.z);
    spotlight.target = model;
    scene.add(spotlight);
  });
}

function createAmbientParticles(scene) {
  // Create particle system for ambient floating particles
  const particleCount = 1000;
  const particles = new THREE.BufferGeometry();
  
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  
  const color = new THREE.Color();
  
  for (let i = 0; i < particleCount; i++) {
    // Position
    positions[i * 3] = (Math.random() * 2 - 1) * 100; // x
    positions[i * 3 + 1] = Math.random() * 50; // y
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * 100; // z
    
    // Color
    const colorIndex = Math.floor(Math.random() * 3);
    if (colorIndex === 0) {
      color.setHSL(0.6, 0.8, 0.9); // Blue
    } else if (colorIndex === 1) {
      color.setHSL(0.3, 0.8, 0.9); // Green
    } else {
      color.setHSL(0.15, 0.8, 0.9); // Yellow
    }
    
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    
    // Size
    sizes[i] = Math.random() * 0.5 + 0.1;
  }
  
  particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  
  const particleMaterial = new THREE.PointsMaterial({
    size: 1,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true
  });
  
  const particleSystem = new THREE.Points(particles, particleMaterial);
  scene.add(particleSystem);
  
  // Animate particles
  particleSystem.userData.animation = {
    update: (delta) => {
      const positions = particleSystem.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3 + 1] += Math.sin((Date.now() * 0.001) + i) * 0.01;
        
        // Reset particles that go too high
        if (positions[i * 3 + 1] > 60) {
          positions[i * 3 + 1] = 0;
        }
      }
      particleSystem.geometry.attributes.position.needsUpdate = true;
    }
  };
}