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

// Custom Audio Engine
class AudioEngine {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.instruments = {};
    this.reverb = null;
    this.oscillatorTypes = {
      sine: 'sine',
      square: 'square',
      sawtooth: 'sawtooth',
      triangle: 'triangle'
    };
  }

  async initialize() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create master gain node
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.7; // Default volume
    this.masterGain.connect(this.context.destination);
    
    // Create reverb
    this.reverb = await this.createReverb(1.5);
    
    // Create instruments
    this.instruments = {
      synth: this.createSynth({ type: 'sine', attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 }),
      bass: this.createSynth({ type: 'triangle', attack: 0.05, decay: 0.2, sustain: 0.4, release: 1.5 }),
      piano: this.createSynth({ type: 'triangle', attack: 0.01, decay: 0.1, sustain: 0.5, release: 1 }),
      guitar: this.createSynth({ type: 'square', attack: 0.01, decay: 0.1, sustain: 0.3, release: 1 }),
      drum: this.createDrumSynth(),
      flute: this.createFMSynth({ modRatio: 3.01, modAmount: 14, attack: 0.1, decay: 0.2, sustain: 0.8, release: 1.5 }),
      harp: this.createPluckedSynth(),
      bells: this.createMetalSynth()
    };
  }

  resumeContext() {
    if (this.context && this.context.state !== 'running') {
      this.context.resume();
    }
  }

  createSynth({ type, attack, decay, sustain, release }) {
    return (note, duration = 0.25) => {
      // Convert note to frequency if it's a string
      const freq = typeof note === 'string' ? this.noteToFrequency(note) : note;
      
      const oscillator = this.context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = freq;
      
      const gainNode = this.context.createGain();
      gainNode.gain.value = 0;
      
      // Connect to reverb and master
      oscillator.connect(gainNode);
      gainNode.connect(this.reverb);
      this.reverb.connect(this.masterGain);
      
      // Start oscillator
      oscillator.start();
      
      // ADSR envelope
      const now = this.context.currentTime;
      gainNode.gain.linearRampToValueAtTime(0.8, now + attack);
      gainNode.gain.linearRampToValueAtTime(sustain * 0.8, now + attack + decay);
      gainNode.gain.setValueAtTime(sustain * 0.8, now + duration - release);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);
      
      // Stop and disconnect
      setTimeout(() => {
        oscillator.stop();
        oscillator.disconnect();
        gainNode.disconnect();
      }, (duration + 0.1) * 1000);
    };
  }

  createDrumSynth() {
    return (_, duration = 0.1) => {
      const noise = this.context.createBufferSource();
      const bufferSize = this.context.sampleRate * 0.5;
      const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const output = buffer.getChannelData(0);
      
      // Fill buffer with noise
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      noise.buffer = buffer;
      
      const gainNode = this.context.createGain();
      gainNode.gain.value = 0;
      
      // Filter to shape the noise
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 440;
      filter.Q.value = 0.7;
      
      // Connect
      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.reverb);
      this.reverb.connect(this.masterGain);
      
      // Start noise
      noise.start();
      
      // Envelope
      const now = this.context.currentTime;
      gainNode.gain.linearRampToValueAtTime(0.8, now + 0.005);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);
      
      // Stop and disconnect
      setTimeout(() => {
        noise.stop();
        noise.disconnect();
        filter.disconnect();
        gainNode.disconnect();
      }, (duration + 0.1) * 1000);
    };
  }

  createFMSynth({ modRatio, modAmount, attack, decay, sustain, release }) {
    return (note, duration = 0.25) => {
      const freq = typeof note === 'string' ? this.noteToFrequency(note) : note;
      
      // Carrier
      const carrier = this.context.createOscillator();
      carrier.type = 'sine';
      carrier.frequency.value = freq;
      
      // Modulator
      const modulator = this.context.createOscillator();
      modulator.type = 'sine';
      modulator.frequency.value = freq * modRatio;
      
      // Modulation gain
      const modGain = this.context.createGain();
      modGain.gain.value = modAmount * (freq / 100); // Scale mod amount by frequency
      
      // Output gain
      const gainNode = this.context.createGain();
      gainNode.gain.value = 0;
      
      // Connect
      modulator.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(gainNode);
      gainNode.connect(this.reverb);
      this.reverb.connect(this.masterGain);
      
      // Start oscillators
      carrier.start();
      modulator.start();
      
      // ADSR envelope
      const now = this.context.currentTime;
      gainNode.gain.linearRampToValueAtTime(0.8, now + attack);
      gainNode.gain.linearRampToValueAtTime(sustain * 0.8, now + attack + decay);
      gainNode.gain.setValueAtTime(sustain * 0.8, now + duration - release);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);
      
      // Stop and disconnect
      setTimeout(() => {
        carrier.stop();
        modulator.stop();
        carrier.disconnect();
        modulator.disconnect();
        modGain.disconnect();
        gainNode.disconnect();
      }, (duration + 0.1) * 1000);
    };
  }

  createPluckedSynth() {
    return (note, duration = 0.5) => {
      const freq = typeof note === 'string' ? this.noteToFrequency(note) : note;
      
      // Create a buffer of noise
      const bufferSize = this.context.sampleRate * 0.5;
      const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const output = buffer.getChannelData(0);
      
      // Fill with noise
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      // Create source and filter
      const noise = this.context.createBufferSource();
      noise.buffer = buffer;
      
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq * 2;
      filter.Q.value = 1;
      
      const gainNode = this.context.createGain();
      gainNode.gain.value = 0.8;
      
      // Connect
      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.reverb);
      this.reverb.connect(this.masterGain);
      
      // Start
      noise.start();
      
      // Decay
      gainNode.gain.setValueAtTime(0.8, this.context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
      
      // Stop and disconnect
      setTimeout(() => {
        noise.stop();
        noise.disconnect();
        filter.disconnect();
        gainNode.disconnect();
      }, duration * 1000);
    };
  }

  createMetalSynth() {
    return (note, duration = 0.5) => {
      const freq = typeof note === 'string' ? this.noteToFrequency(note) : note;
      
      // Multiple oscillators at harmonic frequencies for metallic sound
      const harmonics = [1, 1.5, 2.32, 3.01, 4.7, 6.2];
      const oscillators = [];
      const gains = [];
      
      for (let i = 0; i < harmonics.length; i++) {
        const osc = this.context.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * harmonics[i];
        
        const gain = this.context.createGain();
        gain.gain.value = 0.2 * (1 - i * 0.1); // Decreasing gain for higher harmonics
        
        // Connect
        osc.connect(gain);
        gain.connect(this.reverb);
        
        oscillators.push(osc);
        gains.push(gain);
        
        // Start
        osc.start();
      }
      
      this.reverb.connect(this.masterGain);
      
      // Decay
      for (const gain of gains) {
        gain.gain.setValueAtTime(gain.gain.value, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
      }
      
      // Stop and disconnect
      setTimeout(() => {
        for (let i = 0; i < oscillators.length; i++) {
          oscillators[i].stop();
          oscillators[i].disconnect();
          gains[i].disconnect();
        }
      }, duration * 1000);
    };
  }

  async createReverb(timeInSeconds = 1) {
    const sampleRate = this.context.sampleRate;
    const length = sampleRate * timeInSeconds;
    const impulse = this.context.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    
    // Create the impulse
    for (let i = 0; i < length; i++) {
      const n = i / length;
      // Decay curve
      const t = i / sampleRate;
      const decay = Math.exp(-t * 3);
      
      // Random values between -1 and 1
      impulseL[i] = (Math.random() * 2 - 1) * decay;
      impulseR[i] = (Math.random() * 2 - 1) * decay;
    }
    
    const convolver = this.context.createConvolver();
    convolver.buffer = impulse;
    
    const reverbGain = this.context.createGain();
    reverbGain.gain.value = 0.3; // Reverb wet level
    
    convolver.connect(reverbGain);
    
    return reverbGain;
  }

  noteToFrequency(note) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // Parse the note and octave (e.g., "C4", "F#5")
    let octave = parseInt(note.slice(-1));
    let noteName = note.slice(0, -1);
    
    // Handle flats (e.g., "Eb4")
    if (noteName.includes('b')) {
      const flatNote = noteName.replace('b', '');
      const flatIndex = notes.indexOf(flatNote);
      if (flatIndex > 0) {
        noteName = notes[flatIndex - 1];
      } else {
        noteName = notes[11]; // B if the flat note was C
        octave -= 1;
      }
    }
    
    // Get the note index
    const noteIndex = notes.indexOf(noteName);
    
    if (noteIndex === -1) {
      console.error('Invalid note:', note);
      return 440; // Default to A4
    }
    
    // Calculate frequency (A4 = 440Hz)
    const a4Index = 9 + 12 * 4; // A4 is the 9th note (0-indexed) in the 4th octave
    const currentIndex = noteIndex + 12 * octave;
    const halfStepsFromA4 = currentIndex - a4Index;
    
    return 440 * Math.pow(2, halfStepsFromA4 / 12);
  }

  setVolume(value) {
    if (this.masterGain) {
      // Convert to a reasonable volume curve
      this.masterGain.gain.value = Math.pow(value, 2);
    }
  }
}

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
let clientColor = null;
let audioEngine = null;

// Initialize the audio system
export async function initializeAudio() {
  audioEngine = new AudioEngine();
  await audioEngine.initialize();
  
  notes = generateNotes(CURRENT_SCALE, currentOctave, GRID_ROWS);
  
  // Initialize audio context on user interaction
  document.body.addEventListener('click', async () => {
    audioEngine.resumeContext();
    console.log('Audio context started');
  }, { once: true });
  
  // Return the audio system API
  return {
    setNetworkSystem(network) {
      networkSystem = network;
      roomState = network.getRoomState();
      roomPresence = network.getPresence();
      clientColor = network.getClientColor();
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
      audioEngine.setVolume(volume);
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
                  this.playSound(noteInfo.note, noteInfo.instrument);
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
      audioEngine.resumeContext();
      const instrument = audioEngine.instruments[instrumentType] || audioEngine.instruments.synth;
      instrument(note, 0.25);
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
            this.toggleNote(row, col, cell, clientColor);
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
    
    toggleNote(row, col, cell, color) {
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
        cell.style.backgroundColor = color;
        
        // Play sound immediately on click
        this.playSound(note, currentInstrument);
        
        // Send note flash event
        const rect = cell.getBoundingClientRect();
        const gridRect = document.getElementById('grid').getBoundingClientRect();
        const x = (rect.left + rect.width / 2 - gridRect.left) / gridRect.width;
        const y = (rect.top + rect.height / 2 - gridRect.top) / gridRect.height;
        
        networkSystem.send({
          type: 'noteOn',
          x,
          y,
          color: color
        });
      }
      
      networkSystem.updatePresence({
        activeNotes: updatedNotes
      });
    },
    
    clearNotes() {
      activeNotes = {};
    },
    
    // Spatial audio for 3D world
    createPositionalSound(position, instrument = 'synth', camera) {
      // Create a panner node
      const panner = audioEngine.context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'exponential';
      panner.refDistance = 1;
      panner.maxDistance = 10000;
      panner.rolloffFactor = 1;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 0;
      panner.coneOuterGain = 0;
      
      // Set position
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
      
      // Connect to master
      panner.connect(audioEngine.masterGain);
      
      return {
        play(note) {
          // Create a temporary gain node for this note
          const gainNode = audioEngine.context.createGain();
          gainNode.gain.value = 0.5;
          gainNode.connect(panner);
          
          // Play the note
          const instrument = audioEngine.instruments[instrument] || audioEngine.instruments.synth;
          instrument(note, 0.25);
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

// Set up instruments for the 3D world
export function setupInstruments() {
  return {
    INSTRUMENT_TYPES: Object.keys({
      synth: null,
      bass: null,
      piano: null,
      guitar: null,
      drum: null,
      flute: null,
      harp: null,
      bells: null
    }),
  };
}