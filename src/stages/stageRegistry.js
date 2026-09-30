// src/stages/stageRegistry.js
//
// Single index of every selectable stage. The loader (src/main.js) reads this
// registry: real GLB stages reuse their boot-loaded assets, placeholder ids
// build a procedural scene via their builder.

import { PLACEHOLDER_STAGES } from './placeholderStages.js';

const CAROUSEL_ENTRY = {
    id: 'the_carousel',
    name: 'The Carousel',
    kind: 'real',
    music: 'the-carousel.ogg',
    notes: 'The original arena. Loads the shipped GLB environment.',
    build: null,
};

export const STAGE_REGISTRY = [
    CAROUSEL_ENTRY,
    ...PLACEHOLDER_STAGES.map((stage) => ({
        id: stage.id,
        name: stage.name,
        kind: 'placeholder',
        music: null,
        notes: stage.notes,
        build: stage.build,
    })),
];

export function getStageEntry(id) {
    return STAGE_REGISTRY.find((entry) => entry.id === id) || STAGE_REGISTRY[0];
}

export function isPlaceholderStage(id) {
    return getStageEntry(id).kind === 'placeholder';
}
