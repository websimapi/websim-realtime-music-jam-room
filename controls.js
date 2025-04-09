export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function setupMobileControls(player, camera) {
  const joystickElement = document.getElementById('joystick');
  const joystickContainer = document.querySelector('.joystick-container');
  const mobileControls = document.getElementById('mobile-controls');
  
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
  document.getElementById('mobile-action').addEventListener('touchstart', (e) => {
    e.preventDefault();
    interactWithNearestInstrument();
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
  const moveSpeed = 0.1;
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
  
  function interactWithNearestInstrument() {
    // TODO: Implement interaction with nearest instrument
    const nearestInstrument = world.getNearestInstrument(player.position);
    if (nearestInstrument) {
      // Show the instrument panel
      document.getElementById('instrument-panel').classList.remove('hidden');
      audioSystem.setCurrentInstrument(nearestInstrument);
    }
  }
}