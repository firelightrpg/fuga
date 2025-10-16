<script>
  // Number of frets to display
  export let fretCount = 12;

  // Standard tuning from low E (string 6) to high E (string 1)
  const strings = [
    { name: 'e', openNote: 'E2' },
    { name: 'B', openNote: 'B2' },
    { name: 'G', openNote: 'G2' },
    { name: 'D', openNote: 'D3' },
    { name: 'A', openNote: 'A3' },
    { name: 'E', openNote: 'E4' }
  ];

  // --- SVG Dimensions ---
  const width = 800;
  const height = 150;
  const nutWidth = 10;
  const fretWidth = 2;
  const stringHeight = (height - 20) / (strings.length - 1);

  // Calculate the position of each fret
  const fretPositions = Array.from({ length: fretCount + 1 }, (_, i) => {
    if (i === 0) return nutWidth;
    return nutWidth + (width - nutWidth) * (i / fretCount);
  });

  // Positions for the inlay dots (3, 5, 7, 9, 12)
  const inlayFrets = [3, 5, 7, 9];
  const doubleInlayFret = 12;

</script>

<svg viewBox={`0 0 ${width} ${height}`} aria-label="Guitar Fretboard">
  <!-- Neck Wood -->
  <rect x="0" y="0" width={width} height={height} fill="#E3B485" />

  <!-- Nut -->
  <rect x="0" y="0" width={nutWidth} height={height} fill="#222" />

  <!-- Frets -->
  {#each Array(fretCount) as _, i}
    <rect 
      x={fretPositions[i + 1] - fretWidth / 2} 
      y="0" 
      width={fretWidth} 
      height={height} 
      fill="#ccc" 
    />
  {/each}
  
  <!-- Inlay Dots -->
  {#each inlayFrets as fret}
    <circle 
      cx={(fretPositions[fret] + fretPositions[fret - 1]) / 2}
      cy={height / 2}
      r="8"
      fill="#a1a1a1"
    />
  {/each}

  <!-- Double Dot Inlay at 12th Fret -->
  {#if fretCount >= 12}
    <circle
      cx={(fretPositions[12] + fretPositions[11]) / 2}
      cy={height / 3}
      r="8"
      fill="#a1a1a1"
    />
    <circle
      cx={(fretPositions[12] + fretPositions[11]) / 2}
      cy={2 * height / 3}
      r="8"
      fill="#a1a1a1"
    />
  {/if}

  <!-- Strings -->
  {#each strings as string, i}
    <line
      x1="0"
      y1={10 + i * stringHeight}
      x2={width}
      y2={10 + i * stringHeight}
      stroke="#ddd"
      stroke-width={1 + i * 0.5}
    />
  {/each}

</svg>