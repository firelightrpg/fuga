<script>
  export let fretCount = 12;

  const strings = [
    { name: 'e', openNote: 'E2' },
    { name: 'B', openNote: 'B2' },
    { name: 'G', openNote: 'G2' },
    { name: 'D', openNote: 'D3' },
    { name: 'A', openNote: 'A3' },
    { name: 'E', openNote: 'E4' }
  ];

  // --- SVG Dimensions ---
  const viewboxWidth = 800;
  const viewboxHeight = 150;
  const nutWidth = 15;
  const fretWireWidth = 3;
  const stringSpacing = (viewboxHeight - 20) / (strings.length - 1);
  const scaleLength = viewboxWidth - nutWidth - 10; // Reserve space at the end

  // --- Fret Position Calculation ---
  // Position each fret proportionally across the scale length
  const fretPositions = Array.from({ length: fretCount + 1 }, (_, i) => {
    if (i === 0) return nutWidth; // Position of the nut itself
    // Linear distribution for visual purposes
    return nutWidth + (scaleLength * i) / fretCount;
  });  const inlayFrets = [3, 5, 7, 9];
</script>

<svg viewBox={`0 0 ${viewboxWidth} ${viewboxHeight}`} preserveAspectRatio="xMidYMid meet" aria-label="Guitar Fretboard">
  <!-- Neck Wood -->
  <rect x="0" y="0" width={viewboxWidth} height={viewboxHeight} fill="#E3B485" />

  <!-- Nut -->
  <rect x="0" y="0" width={nutWidth} height={viewboxHeight} fill="#222" />

  <!-- Frets -->
  {#each fretPositions.slice(1) as pos, i}
    <rect 
      x={pos - fretWireWidth / 2} 
      y="0" 
      width={fretWireWidth} 
      height={viewboxHeight} 
      fill="#bbb" 
    />
  {/each}
  
  <!-- Inlay Dots -->
  {#each inlayFrets as fret}
    <circle 
      cx={(fretPositions[fret] + fretPositions[fret - 1]) / 2}
      cy={viewboxHeight / 2}
      r="8"
      fill="#a1a1a1"
    />
  {/each}

  <!-- Double Dot Inlay at 12th Fret -->
  {#if fretCount >= 12}
    <circle
      cx={(fretPositions[12] + fretPositions[11]) / 2}
      cy={viewboxHeight / 3}
      r="8"
      fill="#a1a1a1"
    />
    <circle
      cx={(fretPositions[12] + fretPositions[11]) / 2}
      cy={2 * viewboxHeight / 3}
      r="8"
      fill="#a1a1a1"
    />
  {/if}

  <!-- Strings -->
  {#each strings as string, i}
    <line
      x1={nutWidth}
      y1={10 + i * stringSpacing}
      x2={viewboxWidth}
      y2={10 + i * stringSpacing}
      stroke="#ddd"
      stroke-width={1 + i * 0.5}
    />
  {/each}
</svg>

<style>
  svg {
    width: 100%;
    height: auto;
  }
</style>