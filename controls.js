import * as THREE from 'three';

export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Movement and controls state
const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  run: false
};

let moveSpeed = 0.15; 
const GRAVITY = 0.01;
let velocity = new THREE.Vector3();
let canJump = true;
let isOnGround = true;

export function setupMobileControls(player, camera, world, audioSystem) {
  const joystickElement = document.getElementById('joystick');
  const joystickContainer = document.querySelector('.joystick-container');
  const mobileControls = document.getElementById('mobile-controls');
  const actionButton = document.getElementById('mobile-action');
  
  // Show mobile controls
  mobileControls.style.display = 'block';
  
  let joystickActive = false;
  let joystickCenter = { x: 0, y: 0 };
  let joystickPosition = { x: 0, y: 0 };
  
  // Touch start event for joystick
  joystickContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    
    const containerRect = joystickContainer.getBoundingClientRect();
    joystickCenter = {
      x: containerRect.left + containerRect.width / 2,
      y: containerRect.top + containerRect.height / 2
    };
    
    updateJoystickPosition(e.touches[0].clientX, e.touches[0].clientY);
  });
  
  // Touch move event for joystick
  document.addEventListener('touchmove', (e) => {
    if (joystickActive) {
      e.preventDefault();
      updateJoystickPosition(e.touches[0].clientX, e.touches[0].clientY);
    }
  });
  
  // Touch end event for joystick
  document.addEventListener('touchend', () => {
    joystickActive = false;
    joystickElement.style.transform = 'translate(-50%, -50%)';
    joystickPosition = { x: 0, y: 0 };
  });
  
  // Action button event
  actionButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    interactWithNearestInstrument(player.position, world, audioSystem);
  });
  
  function updateJoystickPosition(clientX, clientY) {
    const containerRadius = joystickContainer.offsetWidth / 2;
    const maxDistance = containerRadius * 0.8;
    
    // Calculate the distance from center
    let dx = clientX - joystickCenter.x;
    let dy = clientY - joystickCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Normalize to max distance
    if (distance > maxDistance) {
      dx = (dx / distance) * maxDistance;
      dy = (dy / distance) * maxDistance;
    }
    
    // Update joystick position
    joystickElement.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    
    // Update normalized joystick position (-1 to 1)
    joystickPosition = {
      x: dx / maxDistance,
      y: dy / maxDistance
    };
  }
  
  // Movement update loop
  const rotateSpeed = 0.05;
  
  function updateMovement() {
    if (!joystickActive) return;
    
    // Rotate player based on joystick x position
    player.rotation.y -= joystickPosition.x * rotateSpeed;
    
    // Move player forward/backward based on joystick y position
    if (Math.abs(joystickPosition.y) > 0.1) {
      const direction = new THREE.Vector3(0, 0, -joystickPosition.y);
      direction.applyQuaternion(player.quaternion);
      
      player.position.add(direction.multiplyScalar(moveSpeed));
    }
    
    // Update camera to follow player
    camera.position.set(
      player.position.x,
      player.position.y + 1.6,
      player.position.z
    );
    camera.quaternion.copy(player.quaternion);
    
    requestAnimationFrame(updateMovement);
  }
  
  updateMovement();
}

export function setupDesktopControls(player, camera, world, audioSystem) {
  // Add keyboard event listeners
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  
  // Add mouse interaction for instrument interaction
  document.addEventListener('click', onMouseClick);
  
  function onKeyDown(event) {
    switch (event.code) {
      case 'KeyW':
        keys.forward = true;
        break;
      case 'KeyS':
        keys.backward = true;
        break;
      case 'KeyA':
        keys.left = true;
        break;
      case 'KeyD':
        keys.right = true;
        break;
      case 'KeyE':
        interactWithNearestInstrument(player.position, world, audioSystem);
        break;
      case 'Space':
        if (canJump && isOnGround) {
          velocity.y = 0.2;
          canJump = false;
          setTimeout(() => { canJump = true; }, 800);
        }
        break;
      case 'ShiftLeft':
        keys.run = true;
        moveSpeed = 0.25; 
        break;
    }
  }
  
  function onKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
        keys.forward = false;
        break;
      case 'KeyS':
        keys.backward = false;
        break;
      case 'KeyA':
        keys.left = false;
        break;
      case 'KeyD':
        keys.right = false;
        break;
      case 'ShiftLeft':
        keys.run = false;
        moveSpeed = 0.15;
        break;
    }
  }
  
  function onMouseClick(event) {
    const mouse = new THREE.Vector2(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // Here we could implement raycasting to interact with objects
    // For simplicity, we'll just use the E key for now
  }
}

export function updatePlayerMovement(player, camera, delta) {
  const direction = new THREE.Vector3();
  
  velocity.y -= GRAVITY;
  
  if (player.position.y <= 0) {
    velocity.y = 0;
    player.position.y = 0;
    isOnGround = true;
  } else {
    isOnGround = false;
  }
  
  if (keys.forward) direction.z = -1;
  if (keys.backward) direction.z = 1;
  if (keys.left) direction.x = -1;
  if (keys.right) direction.x = 1;
  
  if (direction.length() > 0) {
    direction.normalize();
    
    direction.applyQuaternion(player.quaternion);
    
    direction.multiplyScalar(moveSpeed * delta * 60);
    
    player.position.add(direction);
  }
  
  player.position.y += velocity.y;
  
  camera.position.set(
    player.position.x,
    player.position.y + 1.6, 
    player.position.z
  );
  
  camera.quaternion.copy(player.quaternion);
}

export function interactWithNearestInstrument(playerPosition, world, audioSystem) {
  const nearestInstrument = world.getNearestInstrument(playerPosition);
  if (nearestInstrument) {
    document.getElementById('instrument-panel').classList.remove('hidden');
    audioSystem.setCurrentInstrument(nearestInstrument);
  }
}