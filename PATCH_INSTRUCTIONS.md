# Ground Alignment Fix

Please make these two changes to src/App.js:

## Change 1 - Line 500 (Ground position)
Change from:
```javascript
top: `${gameDims.groundY + gameDims.playerSize - 5}px`,
```
To:
```javascript
top: `${gameDims.groundY + gameDims.playerSize}px`,
```

## Change 2 - Line 515 (Player position)
Change from:
```javascript
top: `${playerYRef.current - 5}px`,
```
To:
```javascript
top: `${playerYRef.current}px`,
```

This will remove the -5 pixel offsets so the sprites sit directly on the ground.
