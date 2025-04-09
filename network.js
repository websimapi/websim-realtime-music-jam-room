export async function setupNetwork(onReady, onJoin, onLeave, onUpdate) {
  const room = new WebsimSocket();
  
  await room.initialize();
  
  // Initial state when joining room
  const initialPresence = {
    instrument: 'exploring',
    color: getRandomColor(),
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    activeNotes: {}
  };
  
  room.updatePresence(initialPresence);
  
  // If room state is empty, initialize it
  if (!room.roomState.tempo) {
    room.updateRoomState({
      tempo: 120,
      isPlaying: false,
      instrumentPositions: {},
      worldSeed: Math.floor(Math.random() * 1000000)
    });
  }
  
  // Subscribe to presence changes
  room.subscribePresence((presence) => {
    Object.keys(presence).forEach(clientId => {
      if (clientId !== room.clientId && presence[clientId]) {
        onUpdate(clientId, presence[clientId]);
      }
    });
  });
  
  // Subscribe to room state changes
  room.subscribeRoomState((state) => {
    // Handle state changes
  });
  
  // Listen for presence update requests
  room.subscribePresenceUpdateRequests((request, fromClientId) => {
    if (request.type === 'playNote') {
      // Forward to the audio system - this will be handled in the app.js file
      if (window.audioSystem) {
        window.audioSystem.playSound(request.note, request.instrument);
      }
    }
  });
  
  // Event handling
  room.onmessage = (event) => {
    const data = event.data;
    
    switch(data.type) {
      case 'connected':
        onJoin(data.clientId, data.username);
        break;
      case 'disconnected':
        onLeave(data.clientId, data.username);
        break;
      case 'noteOn':
        // Handle note playing events
        if (window.audioSystem) {
          // Play instrument sound based on the event
          const note = data.note || 'C4'; // Default note if not specified
          const instrument = data.instrument || 'synth';
          window.audioSystem.playSound(note, instrument);
        }
        break;
    }
  };
  
  // Get self info
  const self = room.peers[room.clientId];
  const roomInfo = {
    username: self.username,
    clientId: room.clientId,
    avatarUrl: self.avatarUrl
  };
  
  // Set the global room reference for position updates
  setRoomReference(room);
  
  // Return network API with a trigger for onReady callback
  return {
    triggerReady() {
      // Only call onReady when explicitly triggered from app.js
      onReady(roomInfo);
    },
    
    getClientId() {
      return room.clientId;
    },
    
    getClientColor() {
      return room.presence[room.clientId]?.color || '#6c5ce7';
    },
    
    getPeers() {
      return room.peers;
    },
    
    getPresence() {
      return room.presence;
    },
    
    getRoomState() {
      return room.roomState;
    },
    
    updatePresence(presenceData) {
      room.updatePresence(presenceData);
    },
    
    updateRoomState(stateData) {
      room.updateRoomState(stateData);
    },
    
    requestPresenceUpdate(clientId, updateData) {
      room.requestPresenceUpdate(clientId, updateData);
    },
    
    send(eventData) {
      room.send(eventData);
    }
  };
}

// Room reference for updatePlayerState
let room = null;

export function updatePlayerState(position, rotation) {
  if (!room) return;
  
  // Only send updates when values change significantly to reduce network traffic
  const currentPosition = room.presence[room.clientId]?.position;
  const currentRotation = room.presence[room.clientId]?.rotation;
  
  let shouldUpdate = false;
  
  if (!currentPosition || 
      Math.abs(currentPosition.x - position.x) > 0.1 ||
      Math.abs(currentPosition.y - position.y) > 0.1 ||
      Math.abs(currentPosition.z - position.z) > 0.1) {
    shouldUpdate = true;
  }
  
  if (!currentRotation ||
      Math.abs(currentRotation.y - rotation.y) > 0.1) {
    shouldUpdate = true;
  }
  
  if (shouldUpdate) {
    room.updatePresence({
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      },
      rotation: {
        x: rotation.x,
        y: rotation.y,
        z: rotation.z
      }
    });
  }
}

// Export a function to set the room reference
export function setRoomReference(roomRef) {
  room = roomRef;
}

function getRandomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 65%)`;
}