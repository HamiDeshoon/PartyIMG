const fs = require('fs');
const path = require('path');

// Modify src/types.ts
const typesPath = path.join(process.cwd(), 'src', 'types.ts');
let typesContent = fs.readFileSync(typesPath, 'utf8');

const newFilters = `export const FILM_FILTERS: FilterPreset[] = [
  {
    id: "west",
    name: "West Classic",
    cssStyle: "contrast(1.05) brightness(1.08) saturate(0.92)っ sepia(0.08) hue-rotate(-3deg)",
    canvasFilter: "contrast(1.05) brightness(1.08) saturate(0.92) sepia(0.08) hue-rotate(-3deg)",
    description: "Clean, warm tones with subtle vintage warmth. Inspired by the iconic West iOS filter.",
    colorClass: "bg-amber-100 text-amber-900"
  },
  {
    id: "vhs",
    name: "VHS Tape",
    cssStyle: "contrast(1.25) saturate(1.35) sepia(0.15) hue-rotate(-15deg) brightness(1.05)",
    canvasFilter: "contrast(1.25) saturate(1.35) sepia(0.15) hue-rotate(-15deg) brightness(1.05)",
    description: "Warm analog tape color shift with boosted saturation and subtle chromatic aberration.",
    colorClass: "bg-purple-100 text-purple-950"
  },
  {
    id: "portrait",
    name: "Soft Portrait",
    cssStyle: "contrast(0.9) brightness(1.08) saturate(1.15) sepia(0.08)",
    canvasFilter: "contrast(0.9) brightness(1.08) saturate(1.15) sepia(0.08)",
    description: "Gentle skin-tone warmth with reduced harshness for flattering portraits.",
    colorClass: "bg-rose-100 text-rose-900"
  }
];`;

const startIdx = typesContent.indexOf('export const FILM_FILTERS: FilterPreset[] = [');
if (startIdx !== -1) {
  const endIdx = typesContent.indexOf('];', startIdx);
  if (endIdx !== -1) {
    const before = typesContent.substring(0, startIdx);
    const after = typesContent.substring(endIdx + 2);
    typesContent = before + newFilters + after;
    fs.writeFileSync(typesPath, typesContent, 'utf8');
    console.log('Successfully updated src/types.ts');
  } else {
    console.error('Could not find end of FILM_FILTERS');
    process.exit(1);
  }
} else {
  console.error('Could not find FILM_FILTERS definition');
  process.exit(1);
}
