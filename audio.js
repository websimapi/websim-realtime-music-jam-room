import * as Tone from 'tone';

// Constants and configuration
const GRID_COLS = 16;
const GRID_ROWS = 13;
const SCALES = {
  'pentatonic': ['C', 'D', 'E', 'G', 'A'],
  'major': ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'minor': ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  'blues': ['C', 'Eb', 'F', 'F#', 'G', 'Bb']
};
const CURRENT_SCALE = 'pentatonic';

// State variables
let isPlaying = false;
let currentStep = 0;
let stepInterval;
let tempo = 120;
let volume = 0.7;
let currentInstrument = 'synth';
let currentOctave = 3;
let notes = [];
let activeNotes = {};
let roomState = null;
let roomPresence = null;
let networkSystem = null;

// Create instruments
const reverb = new Tone.Reverb(1.5).toDestination();
reverb.wet.value = 0.3;

const instruments = {
  synth: new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 }
  }).connect(reverb),
  
  bass: new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 1.5 }
  }).connect(reverb),
  
  piano: new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle8' },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 1 }
  }).connect(reverb),
  
  guitar: new Tone.PolySynth(Tone.AMSynth, {
    oscillator: { type: 'square' },
    envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 1 }
  }).connect(reverb),
  
  drum: new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 }
  }).connect(reverb),
  
  // New spatial instruments for 3D world
  flute: new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.01,
    modulationIndex: 14,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 1.5 }
  }).connect(reverb),
  
  harp: new Tone.PolySynth(Tone.PluckSynth).connect(reverb),
  
  bells: new Tone.PolySynth(Tone.MetalSynth, {
    frequency: 200,
    envelope: { attack: 0.001, decay: 1.4, release: 0.2 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5
  }).connect(reverb)
};

// Generate notes based on scale
function generateNotes(scale, startOctave, numRows) {
  const notes = [];
  const selectedScale = SCALES[scale];
  let currentOctave = startOctave + Math.floor(numRows / selectedScale.length);
  
  for (let i = 0; i < numRows; i++) {
    const scaleIndex = (numRows - 1 - i) % selectedScale.length;
    if (scaleIndex === selectedScale.length - 1 && i !== 0) {
      currentOctave--;
    }
    notes.push(`${selectedScale[scaleIndex]}${currentOctave}`);
  }
  
  return notes;
}

// Initialize the audio system
export async function initializeAudio() {
  notes = generateNotes(CURRENT_SCALE, currentOctave, GRID_ROWS);
  
  // Initialize audio context on user interaction
  document.body.addEventListener('click', async () => {
    if (Tone.context.state !== 'running') {
      await Tone.start();
      console.log('Audio context started');
    }
  }, { once: true });
  
  // Return the audio system API
  return {
    setNetworkSystem(network) {
      networkSystem = network;
      roomState = network.getRoomState();
      roomPresence = network.getPresence();
    },
    
    setCurrentInstrument(instrument) {
      currentInstrument = instrument;
      if (networkSystem) {
        networkSystem.updatePresence({ instrument: currentInstrument });
      }
    },
    
    setCurrentOctave(octave) {
      currentOctave = octave;
      notes = generateNotes(CURRENT_SCALE, currentOctave, GRID_ROWS);
      if (networkSystem) {
        networkSystem.updatePresence({ octave: currentOctave });
      }
    },
    
    setVolume(vol) {
      volume = vol;
      Object.values(instruments).forEach(inst => {
        inst.volume.value = volume * 10 - 10; // Convert to dB scale
      });
    },
    
    setTempo(bpm) {
      tempo = bpm;
      if (isPlaying) {
        this.stopPlayback();
        this.startPlayback();
      }
    },
    
    startPlayback() {
      if (isPlaying) return;
      
      isPlaying = true;
      const stepDuration = 60000 / (tempo * 4); // 16th notes
      currentStep = 0;
      
      if (networkSystem) {
        networkSystem.updateRoomState({
          isPlaying: true,
          currentStep: 0
        });
      }
      
      stepInterval = setInterval(() => {
        // Move playhead
        const playhead = document.getElementById('playhead');
        const gridElement = document.getElementById('grid');
        if (playhead && gridElement) {
          const stepWidth = gridElement.offsetWidth / GRID_COLS;
          playhead.style.left = `${currentStep * stepWidth}px`;
        }
        
        // Play notes at this step
        if (roomPresence) {
          Object.keys(roomPresence).forEach(clientId => {
            const presence = roomPresence[clientId];
            if (!presence.activeNotes) return;
            
            Object.keys(presence.activeNotes).forEach(key => {
              const [row, col] = key.split('-').map(Number);
              if (col === currentStep) {
                const noteInfo = presence.activeNotes[key];
                
                // Highlight the cell
                const cell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
                if (cell) {
                  cell.classList.add('playing');
                  setTimeout(() => cell.classList.remove('playing'), stepDuration / 2);
                }
                
                // Play the sound
                if (clientId === networkSystem.getClientId()) {
                  playSound(noteInfo.note, instruments[noteInfo.instrument]);
                } else {
                  // Request other clients to play their notes
                  networkSystem.requestPresenceUpdate(clientId, {
                    type: 'playNote',
                    note: noteInfo.note,
                    instrument: noteInfo.instrument
                  });
                }
              }
            });
          });
        }
        
        currentStep = (currentStep + 1) % GRID_COLS;
      }, stepDuration);
    },
    
    stopPlayback() {
      if (!isPlaying) return;
      
      isPlaying = false;
      clearInterval(stepInterval);
      
      // Hide playhead
      const playhead = document.getElementById('playhead');
      if (playhead) {
        playhead.style.left = '-10px';
      }
      
      if (networkSystem) {
        networkSystem.updateRoomState({
          isPlaying: false,
          currentStep: 0
        });
      }
    },
    
    playSound(note, instrumentType) {
      playSound(note, instruments[instrumentType] || instruments.synth);
    },
    
    setupGrid(gridElement, clientColor) {
      gridElement.innerHTML = '';
      
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const cell = document.createElement('div');
          cell.className = 'grid-cell';
          cell.dataset.row = row;
          cell.dataset.col = col;
          cell.dataset.note = notes[row];
          
          // Add click event for toggling notes
          cell.addEventListener('click', (e) => {
            toggleNote(row, col, cell, clientColor);
          });
          
          gridElement.appendChild(cell);
        }
      }
      
      // Initialize with existing notes if available
      if (networkSystem) {
        const presence = networkSystem.getPresence()[networkSystem.getClientId()];
        if (presence && presence.activeNotes) {
          Object.keys(presence.activeNotes).forEach(key => {
            const [row, col] = key.split('-').map(Number);
            const cell = document.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
            if (cell) {
              cell.classList.add('active');
              cell.style.backgroundColor = presence.color;
            }
          });
        }
      }
    },
    
    clearNotes() {
      activeNotes = {};
    },
    
    // Spatial audio for 3D world
    createPositionalSound(position, instrument = 'synth') {
      const listener = new Tone.Listener();
      Tone.Transport.on('update', () => {
        listener.setPosition(
          camera.position.x,
          camera.position.y,
          camera.position.z
        );
        listener.setOrientation(
          camera.getWorldDirection().x,
          camera.getWorldDirection().y,
          camera.getWorldDirection().z,
          0, 1, 0
        );
      });
      
      const panner = new Tone.Panner3D({
        positionX: position.x,
        positionY: position.y,
        positionZ: position.z,
        rolloff: 'linear',
        distanceModel: 'exponential',
        maxDistance: 10000,
        refDistance: 1,
        rolloffFactor: 1
      }).toDestination();
      
      const synth = instruments[instrument].connect(panner);
      
      return {
        play(note) {
          synth.triggerAttackRelease(note, '8n');
        },
        setPosition(x, y, z) {
          panner.positionX.value = x;
          panner.positionY.value = y;
          panner.positionZ.value = z;
        }
      };
    }
  };
}

// Helper function to toggle a note
function toggleNote(row, col, cell, clientColor) {
  if (!networkSystem) return;
  
  const presence = networkSystem.getPresence()[networkSystem.getClientId()];
  const noteKey = `${row}-${col}`;
  const note = notes[row];
  
  const updatedNotes = { ...presence.activeNotes } || {};
  
  if (updatedNotes[noteKey]) {
    // Remove note
    delete updatedNotes[noteKey];
    cell.classList.remove('active');
    cell.style.backgroundColor = '';
  } else {
    // Add note
    updatedNotes[noteKey] = {
      note,
      instrument: currentInstrument
    };
    cell.classList.add('active');
    cell.style.backgroundColor = clientColor;
    
    // Play sound immediately on click
    playSound(note, instruments[currentInstrument]);
    
    // Send note flash event
    const rect = cell.getBoundingClientRect();
    const gridRect = document.getElementById('grid').getBoundingClientRect();
    const x = (rect.left + rect.width / 2 - gridRect.left) / gridRect.width;
    const y = (rect.top + rect.height / 2 - gridRect.top) / gridRect.height;
    
    networkSystem.send({
      type: 'noteOn',
      x,
      y,
      color: clientColor
    });
  }
  
  networkSystem.updatePresence({
    activeNotes: updatedNotes
  });
}

// Helper function to play a sound
function playSound(note, instrument) {
  if (instrument) {
    if (instrument === instruments.drum) {
      instrument.triggerAttackRelease('16n');
    } else {
      instrument.triggerAttackRelease(note, '16n');
    }
  }
}

// Set up instruments for the 3D world
export function setupInstruments() {
  return {
    INSTRUMENT_TYPES: Object.keys(instruments),
    instruments
  };
}