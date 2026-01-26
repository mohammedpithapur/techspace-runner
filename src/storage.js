import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Play, Users } from 'lucide-react';

// Firebase configuration - REPLACE WITH YOUR ACTUAL CONFIG
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const SpaceRunner = () => {
  const [screen, setScreen] = useState('landing');
  const [playerName, setPlayerName] = useState('');
  const [playerContact, setPlayerContact] = useState('');
  const [finalScore, setFinalScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);
  const [error, setError] = useState('');
  
  const firebaseApp = useRef(null);
  const database = useRef(null);
  
  // Game state refs
  const gameActiveRef = useRef(false);
  const playerYRef = useRef(300);
  const velocityYRef = useRef(0);
  const isJumpingRef = useRef(false);
  const isTouchingRef = useRef(false);
  const jumpStartTimeRef = useRef(0);
  const obstaclesRef = useRef([]);
  const worldSpeedRef = useRef(600);
  const scoreRef = useRef(0);
  
  const [, forceUpdate] = useState({});
  
  const animationFrameRef = useRef(null);
  const lastFrameTimeRef = useRef(0);
  const obstacleTimerRef = useRef(null);
  
  const GROUND_Y = 300;
  const GRAVITY = 2200;
  const JUMP_VELOCITY = -950;
  const MIN_JUMP_DURATION = 0.15;
  const MAX_JUMP_HOLD = 0.35;
  const MAX_WORLD_SPEED = 1200;
  const PLAYER_WIDTH = 50;
  const PLAYER_HEIGHT = 50;
  const OBSTACLE_SIZE = 50;

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
      } catch (err) {
        console.error('Firebase initialization error:', err);
        setError('Failed to connect to database. Please check your Firebase config.');
      }
    };

    initFirebase();
  }, []);

  // Load leaderboard from Firebase
  const loadLeaderboard = async () => {
    if (!database.current) return;
    
    setLoading(true);
    try {
      const scoresRef = database.current.ref('scores');
      const snapshot = await scoresRef.orderByChild('score').limitToLast(10).once('value');
      
      const scores = [];
      snapshot.forEach((childSnapshot) => {
        scores.push({
          id: childSnapshot.key,
          ...childSnapshot.val()
        });
      });
      
      scores.sort((a, b) => b.score - a.score);
      setLeaderboard(scores);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      setError('Failed to load leaderboard');
    }
    setLoading(false);
  };

  const checkCollision = () => {
    const playerLeft = 100;
    const playerRight = 100 + PLAYER_WIDTH;
    const playerTop = playerYRef.current;
    const playerBottom = playerYRef.current + PLAYER_HEIGHT;
    
    for (let obs of obstaclesRef.current) {
      const obsLeft = obs.x;
      const obsRight = obs.x + OBSTACLE_SIZE;
      const obsTop = obs.y;
      const obsBottom = obs.y + OBSTACLE_SIZE;
      
      if (
        playerRight - 10 > obsLeft &&
        playerLeft + 10 < obsRight &&
        playerBottom - 10 > obsTop &&
        playerTop + 10 < obsBottom
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
      .filter(obs => obs.x > -100);
    
    const speedMultiplier = Math.floor((worldSpeedRef.current - 600) / 100);
    scoreRef.current += (1 + speedMultiplier) * (deltaTime / 100);
    worldSpeedRef.current = Math.min(worldSpeedRef.current * 1.0001, MAX_WORLD_SPEED);
    
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
    if (playerYRef.current >= GROUND_Y) {
      velocityYRef.current = JUMP_VELOCITY;
      isJumpingRef.current = true;
      jumpStartTimeRef.current = performance.now();
    }
  };

  const handleTouchEnd = () => {
    isTouchingRef.current = false;
  };

  const spawnObstacle = () => {
    if (!gameActiveRef.current) return;
    
    const nextDelay = 1200 + Math.random() * 1800;
    const type = Math.random() > 0.5 ? 'floating' : 'ground';
    
    obstaclesRef.current.push({
      id: Date.now(),
      x: 800,
      y: type === 'floating' ? GROUND_Y - 100 : GROUND_Y,
      type
    });
    
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
    gameActiveRef.current = false;
    playerYRef.current = GROUND_Y;
    velocityYRef.current = 0;
    isJumpingRef.current = false;
    isTouchingRef.current = false;
    jumpStartTimeRef.current = 0;
    obstaclesRef.current = [];
    worldSpeedRef.current = 600;
    scoreRef.current = 0;
    
    gameActiveRef.current = true;
    lastFrameTimeRef.current = performance.now();
    
    animationFrameRef.current = requestAnimationFrame(gameLoop);
    obstacleTimerRef.current = setTimeout(spawnObstacle, 1500);
    
    setScreen('game');
  };

  const handleRegister = () => {
    if (playerName.trim() && playerContact.trim()) {
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
          <h1 className="text-5xl font-bold text-gray-900">TechSpace Runner</h1>
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
          
          {leaderboard.length > 0 && (
            <div className="bg-gray-100 rounded-xl p-4 border-2 border-gray-300">
              <h3 className="text-gray-700 font-semibold mb-3 flex items-center justify-center gap-2">
                <Trophy className="w-5 h-5" />
                Top 3 Scores
              </h3>
              {leaderboard.slice(0, 3).map((entry, i) => (
                <div key={entry.id || i} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                  <span className="text-gray-600">#{i + 1} {entry.name}</span>
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
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'game') {
    return (
      <div 
        className="h-screen w-screen bg-white overflow-hidden relative select-none"
        onTouchStart={(e) => {
          e.preventDefault();
          handleTouchStart();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          handleTouchEnd();
        }}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        style={{ touchAction: 'none' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-blue-100 to-white"></div>

        <div className="absolute top-8 right-8 text-gray-600 font-bold text-2xl z-10">
          {Math.floor(scoreRef.current)}
        </div>

        <div className="absolute top-8 left-8 text-gray-400 text-sm z-10">
          Speed: {Math.round(worldSpeedRef.current)}px/s
        </div>

        <div 
          className="absolute left-0 right-0 h-1 bg-gray-800"
          style={{ top: `${GROUND_Y + PLAYER_HEIGHT}px` }}
        ></div>

        <div
          className="absolute"
          style={{
            left: '100px',
            top: `${playerYRef.current}px`,
            width: `${PLAYER_WIDTH}px`,
            height: `${PLAYER_HEIGHT}px`
          }}
        >
          <div className="w-full h-full bg-gray-800 rounded"></div>
        </div>

        {obstaclesRef.current.map(obs => (
          <div
            key={obs.id}
            className="absolute"
            style={{
              left: `${obs.x}px`,
              top: `${obs.y}px`,
              width: `${OBSTACLE_SIZE}px`,
              height: `${OBSTACLE_SIZE}px`
            }}
          >
            <div className={`w-full h-full rounded ${
              obs.type === 'floating' ? 'bg-red-500' : 'bg-gray-600'
            }`}></div>
          </div>
        ))}

        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center text-gray-600">
          <p className="text-sm">Tap & Hold: Jump Higher | Quick Tap: Short Hop</p>
        </div>
      </div>
    );
  }

  if (screen === 'gameover') {
    return (
      <div className="min-h-screen bg-white text-gray-800 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <h2 className="text-4xl font-bold text-gray-900">Game Over!</h2>
          
          <div className="bg-gray-100 rounded-xl p-6 border-2 border-gray-300">
            <p className="text-gray-600 mb-2">Your Score</p>
            <p className="text-5xl font-bold text-gray-900">{finalScore}</p>
          </div>

          {leaderboard.length > 0 && (
            <div className="bg-gray-100 rounded-xl p-4 border-2 border-gray-300">
              <h3 className="text-gray-700 font-semibold mb-3 flex items-center justify-center gap-2">
                <Trophy className="w-5 h-5" />
                Top Scores
              </h3>
              {leaderboard.slice(0, 5).map((entry, i) => (
                <div key={entry.id || i} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0">
                  <span className="text-gray-600">#{i + 1} {entry.name}</span>
                  <span className="text-gray-900 font-bold">{entry.score}</span>
                </div>
              ))}
            </div>
          )}
          
          <div className="space-y-3">
            <button
              onClick={startGame}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-4 rounded-xl"
            >
              Play Again
            </button>
            
            <button
              onClick={() => {
                setPlayerName('');
                setPlayerContact('');
                setScreen('landing');
              }}
              className="w-full bg-gray-200 hover:bg-gray-300 border-2 border-gray-300 text-gray-700 font-semibold py-3 rounded-xl"
            >
              Back to Home
            </button>
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
          
          <div className="bg-gray-100 rounded-xl p-6 border-2 border-gray-300">
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
                      <span className="text-gray-900 font-medium">{entry.name}</span>
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