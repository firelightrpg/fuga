<script>
  import { createEventDispatcher } from 'svelte';

  export let fretCount = 12;
  export let answerDots = []; // Array of {string: 0-5, fret: 0-12} for showing correct answers
  export let challengeDot = null; // {string: 0-5, fret: 0-12} for identify-note mode

  const dispatch = createEventDispatcher();

  const strings = [
    { name: 'e', openNote: 'E', octave: 4 },
    { name: 'B', openNote: 'B', octave: 3 },
    { name: 'G', openNote: 'G', octave: 3 },
    { name: 'D', openNote: 'D', octave: 3 },
    { name: 'A', openNote: 'A', octave: 2 },
    { name: 'E', openNote: 'E', octave: 2 },
  ];

  // --- SVG Dimensions ---
  const viewboxWidth = 800;
  const viewboxHeight = 150;
  const nutWidth = 15;
  const fretWireWidth = 3;
  const stringSpacing = (viewboxHeight - 20) / (strings.length - 1);
  const scaleLength = viewboxWidth - nutWidth - 10;

  // --- Fret Position Calculation ---
  const fretPositions = Array.from({ length: fretCount + 1 }, (_, i) => {
    if (i === 0) return nutWidth;
    return nutWidth + (scaleLength * i) / fretCount;
  });

  const inlayFrets = [3, 5, 7, 9];

  function handleFretClick(stringIndex, fret) {
    dispatch('fretSelected', { string: stringIndex, fret });
  }

  function getFretCenter(fret) {
    if (fret === 0) {
      return nutWidth / 2;
    }
    return (fretPositions[fret] + fretPositions[fret - 1]) / 2;
  }

  function getStringY(stringIndex) {
    return 10 + stringIndex * stringSpacing;
  }
</script>

<svg
  viewBox={`0 0 ${viewboxWidth} ${viewboxHeight}`}
  preserveAspectRatio="xMidYMid meet"
  aria-label="Guitar Fretboard"
>
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
      cy={(2 * viewboxHeight) / 3}
      r="8"
      fill="#a1a1a1"
    />
  {/if}

  <!-- Strings -->
  {#each strings as string, stringIdx}
    <line
      x1={nutWidth}
      y1={getStringY(stringIdx)}
      x2={viewboxWidth}
      y2={getStringY(stringIdx)}
      stroke="#ddd"
      stroke-width={1 + stringIdx * 0.5}
    />
  {/each}

  <!-- Clickable Fret Areas -->
  {#each strings as _, stringIdx}
    {#each Array(fretCount + 1) as _, fret}
      <rect
        x={fret === 0 ? 0 : fretPositions[fret - 1]}
        y={getStringY(stringIdx) - stringSpacing / 2}
        width={fret === 0 ? nutWidth : fretPositions[fret] - fretPositions[fret - 1]}
        height={stringSpacing}
        fill="transparent"
        style="cursor: pointer;"
        on:click={() => handleFretClick(stringIdx, fret)}
      />
    {/each}
  {/each}

  <!-- Challenge Dot (for identify-note mode) -->
  {#if challengeDot}
    <circle
      cx={getFretCenter(challengeDot.fret)}
      cy={getStringY(challengeDot.string)}
      r="12"
      fill="#FF6B6B"
      stroke="#fff"
      stroke-width="2"
    />
  {/if}

  <!-- Answer Dots (for find-note mode - show all positions) -->
  {#each answerDots as dot}
    <circle
      cx={getFretCenter(dot.fret)}
      cy={getStringY(dot.string)}
      r="10"
      fill="#51CF66"
      stroke="#fff"
      stroke-width="2"
    />
  {/each}
</svg>

<style>
  svg {
    width: 100%;
    height: auto;
  }
</style>
