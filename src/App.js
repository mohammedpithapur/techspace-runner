import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, Play, Users } from 'lucide-react';

const ASSETS = {
  land: encodeURI(`${process.env.PUBLIC_URL}/assets/Land.png`),
  floatingMeteoroid: encodeURI(`${process.env.PUBLIC_URL}/assets/Floating Mateoroid 160x160.png`),
  landedMeteoroid: encodeURI(`${process.env.PUBLIC_URL}/assets/Landed Mateoroid 160x160.png`),
  rocket: encodeURI(`${process.env.PUBLIC_URL}/assets/Rocket Animation.gif`),
  baseModel: encodeURI(`${process.env.PUBLIC_URL}/assets/Base Model.png`),
  gameOverRaccoon: encodeURI(`${process.env.PUBLIC_URL}/assets/Raccoon GameOver.png`),
  logo: `${process.env.PUBLIC_URL}/logo192.png`
};

// Firebase configuration - REPLACE WITH YOUR ACTUAL CONFIG
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAgesXgm2um4P-TUE_NfXZKib-OkvCEA5Q",
  authDomain: "spacerunner-7b8ac.firebaseapp.com",
  databaseURL:"https://spacerunner-7b8ac-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "spacerunner-7b8ac",
  storageBucket: "spacerunner-7b8ac.firebasestorage.app",
  messagingSenderId: "860380846602",
  appId: "1:860380846602:web:6a6370ad3005b646b9ddf3",
  measurementId: "G-BGRG9X3SF7"
};

const SpaceRunner = () => {
  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [screen, setScreen] = useState('landing');
  const [playerName, setPlayerName] = useState('');
  const [playerContact, setPlayerContact] = useState('');
  const [finalScore, setFinalScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [playerHighScore, setPlayerHighScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);
  const [error, setError] = useState('');
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [countdown, setCountdown] = useState(null);
  
  const firebaseApp = useRef(null);
  const database = useRef(null);
  
  // Game state refs
  const gameActiveRef = useRef(false);
  const playerYRef = useRef(0); // Will be set by getGameDimensions
  const velocityYRef = useRef(0);
  const isJumpingRef = useRef(false);
  const isTouchingRef = useRef(false);
  const jumpStartTimeRef = useRef(0);
  const obstaclesRef = useRef([]);
  const worldSpeedRef = useRef(isMobile ? 480 : 600);
  const scoreRef = useRef(0);
  const jumpCountRef = useRef(0);
  const groundOffsetRef = useRef(0);
  
  const [, forceUpdate] = useState({});
  
  const animationFrameRef = useRef(null);
  const lastFrameTimeRef = useRef(0);
  const obstacleTimerRef = useRef(null);
  const gameContainerRef = useRef(null);
  
  // Responsive game dimensions
  const getGameDimensions = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // Much larger player like Chrome Dino - prominently visible
    const sizeFactor = isMobile ? 0.20 : 0.15;
    const maxSize = isMobile ? 130 : 90;
    const playerSize = Math.min(width * sizeFactor, maxSize);
    
    // Floating meteoroid - smaller
    const floatingObstacleSizeFactor = isMobile ? 0.12 : 0.10;
    const floatingObstacleMaxSize = isMobile ? 70 : 55;
    const floatingObstacleSize = Math.min(width * floatingObstacleSizeFactor, floatingObstacleMaxSize);
    
    // Landed meteoroid - larger (like before)
    const landedObstacleSizeFactor = isMobile ? 0.18 : 0.14;
    const landedObstacleMaxSize = isMobile ? 110 : 80;
    const landedObstacleSize = Math.min(width * landedObstacleSizeFactor, landedObstacleMaxSize);
    
    // Ground positioned higher on screen
    const groundY = height * (isMobile ? 0.60 : 0.58);
    return { width, height, playerSize, floatingObstacleSize, landedObstacleSize, groundY };
  };
  
  const dims = getGameDimensions();
  const GROUND_Y = dims.groundY;
  const GRAVITY = 2200;
  const JUMP_VELOCITY = -950;
  const MIN_JUMP_DURATION = 0.15;
  const MAX_JUMP_HOLD = 0.35;
  const MAX_WORLD_SPEED = isMobile ? 4200 : 6200;
  const PLAYER_WIDTH = dims.playerSize;
  const PLAYER_HEIGHT = dims.playerSize;
  const FLOATING_OBSTACLE_SIZE = dims.floatingObstacleSize;
  const LANDED_OBSTACLE_SIZE = dims.landedObstacleSize;

  const vibrate = (pattern) => {
    if (!isMobile || !('vibrate' in navigator)) return;
    navigator.vibrate(pattern);
  };
  
  // Initialize player Y position if not set
  useEffect(() => {
    if (playerYRef.current === 0) {
      playerYRef.current = GROUND_Y;
    }
    
    // Handle window resize
    const handleResize = () => {
      forceUpdate({});
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [GROUND_Y]);

  // Load cached player data from localStorage
  useEffect(() => {
    const cachedName = localStorage.getItem('playerName');
    const cachedContact = localStorage.getItem('playerContact');
    
    if (cachedName) setPlayerName(cachedName);
    if (cachedContact) setPlayerContact(cachedContact);
  }, []);

  // Load leaderboard from Firebase
  const loadLeaderboard = useCallback(async () => {
    if (!database.current) return;
    
    setLoading(true);
    try {
      const scoresRef = database.current.ref('scores');
      const snapshot = await scoresRef.orderByChild('score').limitToLast(100).once('value');
      
      const scores = [];
      snapshot.forEach((childSnapshot) => {
        scores.push({
          id: childSnapshot.key,
          ...childSnapshot.val()
        });
      });
      
      scores.sort((a, b) => b.score - a.score);
      setLeaderboard(scores.slice(0, 10)); // Show only top 10
      
      // Get player's highest score if they have one
      if (playerContact) {
        const playerScores = scores.filter(s => s.contact === playerContact);
        if (playerScores.length > 0) {
          setPlayerHighScore(Math.max(...playerScores.map(s => s.score)));
        }
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      setError('Failed to load leaderboard');
    }
    setLoading(false);
  }, [playerContact]);

  // Preload all game assets before gameplay
  const preloadAssets = useCallback(() => {
    const imagesToLoad = Object.values(ASSETS);
    let loadedCount = 0;
    const totalAssets = imagesToLoad.length;
    
    console.log(`Preloading ${totalAssets} game assets...`);
    
    imagesToLoad.forEach((src, index) => {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        console.log(`Loaded asset ${loadedCount}/${totalAssets}: ${src}`);
        if (loadedCount === totalAssets) {
          console.log('All assets loaded successfully!');
          setAssetsLoaded(true);
        }
      };
      img.onerror = (e) => {
        loadedCount++;
        console.warn(`Failed to load asset ${loadedCount}/${totalAssets}: ${src}`, e);
        if (loadedCount === totalAssets) {
          console.log('Asset loading complete (some may have failed)');
          setAssetsLoaded(true);
        }
      };
      img.src = src;
    });
  }, []);

  // Initialize Firebase
  useEffect(() => {
    const initFirebase = async () => {
      try {
        // Dynamically load Firebase scripts
        const loadScript = (src) => {
          return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
              resolve();
              return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        };

        await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js');

        if (!window.firebase) {
          throw new Error('Firebase failed to load');
        }

        if (!window.firebase.apps.length) {
          firebaseApp.current = window.firebase.initializeApp(FIREBASE_CONFIG);
        } else {
          firebaseApp.current = window.firebase.app();
        }
        
        database.current = firebaseApp.current.database();
        setFirebaseInitialized(true);
        loadLeaderboard();
        preloadAssets();
      } catch (err) {
        console.error('Firebase initialization error:', err);
        setError('Failed to connect to database. Please check your Firebase config.');
      }
    };

    initFirebase();
  }, [loadLeaderboard, preloadAssets]);

  const checkCollision = () => {
    const playerLeft = dims.width * 0.1;
    const playerRight = playerLeft + PLAYER_WIDTH;
    const playerTop = playerYRef.current;
    const playerBottom = playerYRef.current + PLAYER_HEIGHT;
    
    for (let obs of obstaclesRef.current) {
      const obsSize = obs.type === 'floating' ? FLOATING_OBSTACLE_SIZE : LANDED_OBSTACLE_SIZE;
      const obsLeft = obs.x;
      const obsRight = obs.x + obsSize;
      const obsTop = obs.y;
      const obsBottom = obs.y + obsSize;
      
      // Chrome Dino-style forgiving hitboxes - 15% reduction on all sides
      const hitboxPadding = obsSize * 0.15;
      
      if (
        playerRight - hitboxPadding > obsLeft + hitboxPadding &&
        playerLeft + hitboxPadding < obsRight - hitboxPadding &&
        playerBottom - hitboxPadding > obsTop + hitboxPadding &&
        playerTop + hitboxPadding < obsBottom - hitboxPadding
      ) {
        return true;
      }
    }
    return false;
  };

  const gameLoop = (timestamp) => {
    if (!gameActiveRef.current) return;
    
    const deltaTime = timestamp - lastFrameTimeRef.current;
    lastFrameTimeRef.current = timestamp;
    
    if (isJumpingRef.current) {
      const dt = 0.016;
      const jumpDuration = (timestamp - jumpStartTimeRef.current) / 1000;
      
      velocityYRef.current += GRAVITY * dt;
      
      if (!isTouchingRef.current && jumpDuration > MIN_JUMP_DURATION && velocityYRef.current < 0) {
        velocityYRef.current *= 0.5;
      }
      
      if (jumpDuration > MAX_JUMP_HOLD && velocityYRef.current < 0) {
        velocityYRef.current = 0;
      }
      
      playerYRef.current += velocityYRef.current * dt;
      
      if (playerYRef.current >= GROUND_Y) {
        playerYRef.current = GROUND_Y;
        velocityYRef.current = 0;
        isJumpingRef.current = false;
      }
    }
    
    const speed = worldSpeedRef.current / 60;
    obstaclesRef.current = obstaclesRef.current
      .map(obs => ({ ...obs, x: obs.x - speed }))
      .filter(obs => {
        const obsSize = obs.type === 'floating' ? FLOATING_OBSTACLE_SIZE : LANDED_OBSTACLE_SIZE;
        return obs.x > -obsSize - 50;
      });
    
    // Move ground background smoothly - no modulo to prevent any visible jumps
    groundOffsetRef.current += speed;
    
    // Chrome Dino-style scoring and speed increase
    const baseSpeed = isMobile ? 400 : 600;
    const speedMultiplier = Math.floor((worldSpeedRef.current - baseSpeed) / 150);
    scoreRef.current += (1 + speedMultiplier * 0.5) * (deltaTime / 100);
    // More gradual speed increase like Chrome Dino
    worldSpeedRef.current = Math.min(
      worldSpeedRef.current * (isMobile ? 1.00002 : 1.00005),
      MAX_WORLD_SPEED
    );
    
    if (checkCollision()) {
      handleGameOver();
      return;
    }
    
    forceUpdate({});
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  };

  const handleTouchStart = () => {
    if (!gameActiveRef.current) return;
    isTouchingRef.current = true;
    // Only allow jump when on ground to prevent cheating
    if (playerYRef.current >= GROUND_Y - 1) {
      velocityYRef.current = JUMP_VELOCITY;
      isJumpingRef.current = true;
      jumpStartTimeRef.current = performance.now();
      jumpCountRef.current++; // Track jumps
      vibrate(12);
    }
  };

  const handleTouchEnd = () => {
    isTouchingRef.current = false;
  };

  const spawnObstacle = () => {
    if (!gameActiveRef.current) return;
    // Chrome Dino-style predictable spawning with gradual difficulty
    const speedFactor = Math.min(1.5, worldSpeedRef.current / (isMobile ? 400 : 600));
    const baseDelay = 1600 / speedFactor;
    const variance = 600 / speedFactor;
    const nextDelay = Math.max(isMobile ? 900 : 800, baseDelay + Math.random() * variance);

    const spawnX = window.innerWidth * 1.25; // Spawn farther so players see ahead
    const floatingHeight = GROUND_Y - (window.innerHeight * 0.18); // Adjusted for new ground height

    const spawnSingle = (type, offset = 0) => {
      // Position obstacles so their bottoms align with the player's ground level
      const groundLevel = GROUND_Y + PLAYER_HEIGHT;
      const yPos = type === 'floating' ? floatingHeight : groundLevel - LANDED_OBSTACLE_SIZE;
      obstaclesRef.current.push({
        id: `${Date.now()}-${Math.random()}`,
        x: spawnX + offset,
        y: yPos,
        type
      });
    };

    // Meteor spawn patterns with specified probabilities
    const roll = Math.random();
    const avgObstacleSize = (FLOATING_OBSTACLE_SIZE + LANDED_OBSTACLE_SIZE) / 2;
    
    if (roll < 0.40) {
      // Single land meteor - 40%
      spawnSingle('ground', 0);
    } else if (roll < 0.60) {
      // Double land meteor - 20%
      const gap = avgObstacleSize * 1.5;
      spawnSingle('ground', 0);
      spawnSingle('ground', gap);
    } else if (roll < 0.75) {
      // Triple land meteor - 15%
      const gap = avgObstacleSize * 1.1;
      spawnSingle('ground', 0);
      spawnSingle('ground', gap);
      spawnSingle('ground', gap * 2);
    } else {
      // Single floating meteor - 25%
      spawnSingle('floating', 0);
    }
    
    obstacleTimerRef.current = setTimeout(spawnObstacle, nextDelay);
  };

  const handleGameOver = async () => {
    gameActiveRef.current = false;
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    if (obstacleTimerRef.current) {
      clearTimeout(obstacleTimerRef.current);
    }
    
    const score = Math.floor(scoreRef.current);
    setFinalScore(score);
    vibrate([25, 40, 25]);
    
    // Save to Firebase
    if (database.current) {
      try {
        const scoresRef = database.current.ref('scores');
        
        // Check if player already has a score
        const snapshot = await scoresRef
          .orderByChild('contact')
          .equalTo(playerContact)
          .once('value');
        
        if (snapshot.exists()) {
          // Update if new score is higher
          snapshot.forEach((childSnapshot) => {
            const existingScore = childSnapshot.val().score;
            if (score > existingScore) {
              scoresRef.child(childSnapshot.key).update({
                name: playerName,
                score: score,
                timestamp: Date.now()
              });
            }
          });
        } else {
          // Create new entry
          scoresRef.push({
            name: playerName,
            contact: playerContact,
            score: score,
            timestamp: Date.now()
          });
        }
        
        await loadLeaderboard();
      } catch (error) {
        console.error('Failed to save score:', error);
        setError('Failed to save score to database');
      }
    }
    
    setScreen('gameover');
  };

  const startGame = () => {
    const newDims = getGameDimensions();
    playerYRef.current = newDims.groundY;
    gameActiveRef.current = false;
    velocityYRef.current = 0;
    isJumpingRef.current = false;
    isTouchingRef.current = false;
    jumpStartTimeRef.current = 0;
    obstaclesRef.current = [];
    worldSpeedRef.current = isMobile ? 520 : 600;
    scoreRef.current = 0;
    jumpCountRef.current = 0; // Reset jump counter
    groundOffsetRef.current = 0; // Reset ground scroll
    
    setScreen('game');
    setCountdown(3);
    
    // Countdown sequence: 3, 2, 1, GO
    let count = 3;
    const countdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else if (count === 0) {
        setCountdown('GO!');
        setTimeout(() => {
          setCountdown(null);
          // Actually start the game
          gameActiveRef.current = true;
          lastFrameTimeRef.current = performance.now();
          setShowInstructions(true);
          setTimeout(() => setShowInstructions(false), 3000);
          animationFrameRef.current = requestAnimationFrame(gameLoop);
          obstacleTimerRef.current = setTimeout(spawnObstacle, 1500);
        }, 800);
        clearInterval(countdownInterval);
      }
    }, 1000);
    
    forceUpdate({});
  };

  const handleRegister = () => {
    if (playerName.trim() && playerContact.trim()) {
      // Save to localStorage
      localStorage.setItem('playerName', playerName);
      localStorage.setItem('playerContact', playerContact);
      setTimeout(startGame, 100);
    }
  };

  useEffect(() => {
    return () => {
      gameActiveRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (obstacleTimerRef.current) {
        clearTimeout(obstacleTimerRef.current);
      }
    };
  }, []);

  if (screen === 'landing') {
    return (
      <div className="min-h-screen bg-white text-gray-800 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="text-5xl font-bold text-gray-900">Go Rocket</h1>
          <p className="text-gray-600">HTS'26 Web Game Challenge</p>
          
          {error && (
            <div className="bg-red-100 border-2 border-red-300 rounded-xl p-3 text-red-700 text-sm">
              {error}
            </div>
          )}
          
          {!firebaseInitialized && (
            <div className="bg-blue-100 border-2 border-blue-300 rounded-xl p-3 text-blue-700 text-sm">
              Connecting to database...
            </div>
          )}
          
          {!assetsLoaded && firebaseInitialized && (
            <div className="bg-green-100 border-2 border-green-300 rounded-xl p-3 text-green-700 text-sm">
              Loading game assets...
            </div>
          )}
          
          {playerHighScore > 0 && (
            <div className="bg-purple-100 border-2 border-purple-300 rounded-xl p-4">
              <h3 className="text-purple-700 font-semibold mb-2 text-center">Your Best Score</h3>
              <p className="text-purple-900 font-bold text-2xl text-center">{playerHighScore}</p>
            </div>
          )}
          
          {leaderboard.length > 0 && (
            <div className="bg-gray-100 rounded-xl p-4 border-2 border-gray-300 leaderboard-text">
              <h3 className="text-gray-700 font-semibold mb-3 flex items-center justify-center gap-2">
                <Trophy className="w-5 h-5" />
                Top 3 Scores
              </h3>
              {leaderboard.slice(0, 3).map((entry, i) => (
                <div key={entry.id || i} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                  <span className="text-gray-600 uppercase">#{i + 1} {entry.name}</span>
                  <span className="text-gray-900 font-bold">{entry.score}</span>
                </div>
              ))}
            </div>
          )}
          
          <button
            onClick={() => setScreen('register')}
            disabled={!firebaseInitialized}
            className="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2"
          >
            <Play className="w-6 h-6" />
            Start Game
          </button>
          
          <button
            onClick={() => setScreen('leaderboard')}
            className="w-full bg-gray-200 hover:bg-gray-300 border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
          >
            <Users className="w-5 h-5" />
            View Leaderboard
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'register') {
    return (
      <div className="min-h-screen bg-white text-gray-800 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6">
          <button onClick={() => setScreen('landing')} className="text-gray-600 hover:text-gray-900">
            ← Back
          </button>
          
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-gray-900">Player Registration</h2>
            <p className="text-gray-600">Enter your details</p>
          </div>
          
          <div className="bg-gray-100 rounded-xl p-6 border-2 border-gray-300 space-y-4">
            <div>
              <label className="block text-gray-700 mb-2 text-sm font-medium">Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:border-gray-900"
                placeholder="Your name"
              />
            </div>
            
            <div>
              <label className="block text-gray-700 mb-2 text-sm font-medium">Contact</label>
              <input
                type="tel"
                value={playerContact}
                onChange={(e) => setPlayerContact(e.target.value)}
                className="w-full bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:border-gray-900"
                placeholder="Phone number"
              />
            </div>
            
            <button
              onClick={handleRegister}
              disabled={!playerName.trim() || !playerContact.trim()}
              className="w-full bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white font-bold py-4 rounded-xl"
            >
              Start Playing
            </button>
            
            <button
              onClick={() => {
                localStorage.removeItem('playerName');
                localStorage.removeItem('playerContact');
                setPlayerName('');
                setPlayerContact('');
              }}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 rounded-xl border-2 border-gray-300"
            >
              Clear Saved Data
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'game') {
    const gameDims = getGameDimensions();
    console.log('Game rendering:', { gameDims, playerY: playerYRef.current, screen });
    
    return (
      <div 
        ref={gameContainerRef}
        className="h-screen w-screen bg-blue-50 overflow-hidden relative select-none"
        onTouchStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleTouchStart();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleTouchEnd();
        }}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        style={{ touchAction: 'none', position: 'relative', overscrollBehavior: 'contain' }}
      >
        <div
          className="absolute inset-0"
          style={{
            zIndex: 0,
            background: 'linear-gradient(to bottom, #230d58 0%, #dc2e75 33%, #fea957 66%, #f00a13 100%)'
          }}
        ></div>

        {!showInstructions && !prefersReducedMotion && (
          <div 
            className="absolute"
            style={{
              top: '15%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '120px',
              height: '120px',
              zIndex: 3,
              animation: 'float 6s ease-in-out infinite',
              opacity: 0.3
            }}
          >
            <img 
              src={`${process.env.PUBLIC_URL}/logo192.png`} 
              alt="Logo" 
              className="w-full h-full object-contain"
              style={{
                filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.3))'
              }}
            />
          </div>
        )}

        <style>{`
          @keyframes float {
            0%, 100% { transform: translateX(-50%) translateY(0px); }
            50% { transform: translateX(-50%) translateY(-20px); }
          }
        `}</style>

        <div className="absolute text-gray-900 font-bold" style={{ top: '5rem', right: '2rem', fontSize: '2rem', zIndex: 50, color: '#ffffff' }}>
          {Math.floor(scoreRef.current)}
        </div>

        {/* <div className="absolute text-gray-600" style={{ top: '2rem', left: '2rem', fontSize: '1rem', zIndex: 50 }}>
          Speed: {Math.round(worldSpeedRef.current)}px/s
        </div> */}

        <div 
          className="absolute left-0 right-0"
          style={{
            top: `${gameDims.groundY + gameDims.playerSize - 5}px`,
            bottom: 0,
            backgroundImage: `url(${ASSETS.land})`,
            backgroundColor: '#8B4513',
            backgroundRepeat: 'repeat-x',
            backgroundSize: 'auto 100%',
            backgroundPosition: `-${groundOffsetRef.current}px top`,
            zIndex: 5
          }}
        ></div>

        <div
          className="absolute"
          style={{
            left: `${gameDims.width * 0.1}px`,
            top: `${playerYRef.current + 6}px`,
            width: `${gameDims.playerSize}px`,
            height: `${gameDims.playerSize}px`,
            zIndex: 20
          }}
        >
          <img
            src={countdown !== null ? ASSETS.baseModel : ASSETS.rocket}
            alt={countdown !== null ? "Base Model" : "Rocket"}
            className="w-full h-full object-contain"
            onError={(e) => console.error('GIF failed to load:', ASSETS.rocket, e)}
          />
        </div>

        {obstaclesRef.current.map(obs => {
          const obsSize = obs.type === 'floating' ? FLOATING_OBSTACLE_SIZE : LANDED_OBSTACLE_SIZE;
          return (
          <div
            key={obs.id}
            className="absolute"
            style={{
              left: `${obs.x}px`,
              top: `${obs.y}px`,
              width: `${obsSize}px`,
              height: `${obsSize}px`,
              zIndex: 15
            }}
          >
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `url(${obs.type === 'floating' ? ASSETS.floatingMeteoroid : ASSETS.landedMeteoroid})`,
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center'
              }}
            ></div>
          </div>
          );
        })}

        {showInstructions && !countdown && (
          <div 
            className="absolute left-1/2 transform -translate-x-1/2 text-center" 
            style={{ 
              top: '5rem', 
              fontSize: '0.9rem', 
              zIndex: 50,
              color: '#ffffff',
              textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
              backgroundColor: 'rgba(0,0,0,0.4)',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem'
            }}
          >
            <p>Tap & Hold: Jump Higher | Quick Tap: Short Hop</p>
          </div>
        )}

        {countdown !== null && (
          <div 
            className="absolute inset-0 flex items-center justify-center"
            style={{ 
              zIndex: 100,
              backgroundColor: 'rgba(0,0,0,0.5)'
            }}
          >
            <div 
              className="text-white font-bold animate-pulse"
              style={{ 
                fontSize: countdown === 'GO!' ? '8rem' : '12rem',
                textShadow: '0 0 30px rgba(255,255,255,0.8), 0 0 60px rgba(255,255,255,0.5)',
                animation: 'scaleIn 0.3s ease-out'
              }}
            >
              {countdown}
            </div>
          </div>
        )}

        <style>{`
          @keyframes scaleIn {
            0% { transform: scale(0.5); opacity: 0; }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  if (screen === 'gameover') {
    const gameDims = getGameDimensions();
    return (
      <div 
        className="h-screen w-screen overflow-hidden relative"
        style={{ touchAction: 'none' }}
      >
        {/* Game background - frozen */}
        <div
          className="absolute inset-0"
          style={{
            zIndex: 0,
            background: 'linear-gradient(to bottom, #230d58 0%, #dc2e75 33%, #fea957 66%, #f00a13 100%)'
          }}
        ></div>

        {/* Frozen ground */}
        <div 
          className="absolute left-0 right-0"
          style={{
            top: `${gameDims.groundY + gameDims.playerSize - 5}px`,
            bottom: 0,
            backgroundImage: `url(${ASSETS.land})`,
            backgroundColor: '#8B4513',
            backgroundRepeat: 'repeat-x',
            backgroundSize: 'auto 100%',
            backgroundPosition: `-${groundOffsetRef.current}px top`,
            zIndex: 5
          }}
        ></div>

        {/* Game over raccoon always on ground */}
        <div
          className="absolute"
          style={{
            left: `${gameDims.width * 0.1}px`,
            top: `${gameDims.groundY}px`,
            width: `${gameDims.playerSize}px`,
            height: `${gameDims.playerSize}px`,
            zIndex: 40
          }}
        >
          <img
            src={ASSETS.gameOverRaccoon}
            alt="Game Over"
            className="w-full h-full object-contain"
            onError={(e) => console.error('Game Over Raccoon failed to load:', ASSETS.gameOverRaccoon, e)}
          />
        </div>

        {/* Frozen obstacles */}
        {obstaclesRef.current.map(obs => {
          const obsSize = obs.type === 'floating' ? FLOATING_OBSTACLE_SIZE : LANDED_OBSTACLE_SIZE;
          return (
          <div
            key={obs.id}
            className="absolute"
            style={{
              left: `${obs.x}px`,
              top: `${obs.y}px`,
              width: `${obsSize}px`,
              height: `${obsSize}px`,
              zIndex: 15
            }}
          >
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `url(${obs.type === 'floating' ? ASSETS.floatingMeteoroid : ASSETS.landedMeteoroid})`,
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center'
              }}
            ></div>
          </div>
          );
        })}

        {/* Transparent overlay with score and buttons */}
        <div className="absolute inset-0" style={{ zIndex: 50, backgroundColor: 'rgba(0,0,0,0.35)' }}>
          {/* Go Home button in top left corner */}
          <button
            onClick={() => {
              setScreen('landing');
              loadLeaderboard();
            }}
            className="absolute top-6 left-6 bg-gray-700 bg-opacity-80 hover:bg-gray-800 text-white font-semibold px-6 py-2 rounded-lg shadow-lg transform hover:scale-105 transition"
          >
            Go Home
          </button>

          {/* Centered content */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="max-w-md w-full mx-4 text-center space-y-6">
              <h2 className="text-5xl font-bold text-white drop-shadow-lg">Game Over!</h2>
              
              <div className="bg-black bg-opacity-40 rounded-xl p-6 shadow-2xl">
                <p className="text-gray-200 mb-2">Your Score</p>
                <p className="text-5xl font-bold text-white">{finalScore}</p>
              </div>

              {leaderboard.length > 0 && (
                <div className="bg-black bg-opacity-40 rounded-xl p-4 shadow-2xl leaderboard-text">
                  <h3 className="text-white font-semibold mb-3 flex items-center justify-center gap-2">
                    <Trophy className="w-5 h-5" />
                    Top Scores
                  </h3>
                  {leaderboard.slice(0, 3).map((entry, i) => (
                    <div key={entry.id || i} className="flex justify-between items-center py-2 border-b border-gray-400 border-opacity-30 last:border-0">
                      <span className="text-gray-200 uppercase">#{i + 1} {entry.name}</span>
                      <span className="text-white font-bold">{entry.score}</span>
                    </div>
                  ))}
                </div>
              )}
              
              <button
                onClick={startGame}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg transform hover:scale-105 transition"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'leaderboard') {
    return (
      <div className="min-h-screen bg-white text-gray-800 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6">
          <button onClick={() => setScreen('landing')} className="text-gray-600 hover:text-gray-900">
            ← Back
          </button>
          
          <div className="text-center">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
            <h2 className="text-3xl font-bold text-gray-900">Leaderboard</h2>
          </div>
          
          <div className="bg-gray-100 rounded-xl p-6 border-2 border-gray-300 leaderboard-text">
            {loading ? (
              <p className="text-center text-gray-600">Loading...</p>
            ) : leaderboard.length === 0 ? (
              <p className="text-center text-gray-600">No scores yet!</p>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((entry, i) => (
                  <div
                    key={entry.id || i}
                    className={`flex justify-between items-center p-3 rounded-lg ${
                      i === 0 ? 'bg-yellow-100 border-2 border-yellow-400' :
                      i === 1 ? 'bg-gray-200 border-2 border-gray-400' :
                      i === 2 ? 'bg-orange-100 border-2 border-orange-400' :
                      'bg-white border-2 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`font-bold text-xl ${
                        i === 0 ? 'text-yellow-600' :
                        i === 1 ? 'text-gray-600' :
                        i === 2 ? 'text-orange-600' :
                        'text-gray-500'
                      }`}>
                        #{i + 1}
                      </span>
                      <span className="text-gray-900 font-medium uppercase">{entry.name}</span>
                    </div>
                    <span className="text-gray-900 font-bold text-lg">{entry.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
};

export default SpaceRunner;