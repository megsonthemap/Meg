import React from 'react';
import {Composition} from 'remotion';
import {Reel, Plan} from './Reel';
import {Brand, DEFAULT_BRAND} from './brand';
import {Cover, CoverSpec} from './Cover';

const empty: Plan = {fps: 30, duration: 3, segments: [], captions: {mode: 'word', y: 0.245, words: []}};

// `brand` is the resolved brand/brand.json (reel.mjs loads it and passes it in inputProps).
// Without one the neutral standin brand renders, so the Studio preview still works.
export const Root: React.FC = () => (
  <>
  <Composition
    id="Reel"
    component={Reel}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={90}
    defaultProps={{plan: empty, brand: DEFAULT_BRAND as Brand}}
    calculateMetadata={({props}) => ({durationInFrames: Math.max(1, Math.round(props.plan.duration * props.plan.fps)), fps: props.plan.fps})}
  />
  <Composition
    id="ReelWide"
    component={Reel}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={90}
    defaultProps={{plan: empty, brand: DEFAULT_BRAND as Brand}}
    calculateMetadata={({props}) => ({durationInFrames: Math.max(1, Math.round(props.plan.duration * props.plan.fps)), fps: props.plan.fps})}
  />
  <Composition id="Cover" component={Cover} width={1080} height={1920} fps={30} durationInFrames={1}
    defaultProps={{cover: {design: 'top', frame: '', lines: [{t: 'Cover'}]} as CoverSpec, brand: DEFAULT_BRAND as Brand}} />
  </>
);
