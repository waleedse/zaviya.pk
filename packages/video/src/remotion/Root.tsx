import React from 'react'
import { Composition, Still } from 'remotion'
import morning from '../../fixtures/morning-30.json'
import { compose } from '../compose'
import { FPS, H, TOTAL_FRAMES, W } from '../constants'
import type { EditionInput, Timeline } from '../types'
import { Cover } from './Cover'
import { composeNarrated } from '../narrated'
import { DailyHeadlines } from './DailyHeadlines'
import { Narrated } from './Narrated'

const defaultTimeline: Timeline = compose(morning as EditionInput)

type Props = { timeline: Timeline }

const sampleNarrated = composeNarrated({
  title: 'Sample',
  titleUr: 'نمونہ',
  beats: [{ image: 'sample.png', credit: 'AI illustration', kicker: 'نمونہ', sentences: [{ text: 'یہ ایک نمونہ ہے جو کیپشن دکھاتا ہے۔', ms: 4000 }] }],
  audio: 'sample.wav',
  cta: 'مکمل خبر زاویہ ڈاٹ پی کے پر',
})

export const Root: React.FC = () => (
  <>
    <Composition
      id="DailyHeadlines"
      component={DailyHeadlines}
      width={W}
      height={H}
      fps={FPS}
      durationInFrames={TOTAL_FRAMES}
      defaultProps={{ timeline: defaultTimeline } satisfies Props}
      calculateMetadata={({ props }) => ({ durationInFrames: (props as Props).timeline.totalFrames })}
    />
    <Composition
      id="Narrated"
      component={Narrated}
      width={W}
      height={H}
      fps={FPS}
      durationInFrames={sampleNarrated.totalFrames}
      defaultProps={{ timeline: sampleNarrated }}
      calculateMetadata={({ props }) => ({ durationInFrames: (props as { timeline: typeof sampleNarrated }).timeline.totalFrames })}
    />
    <Still id="Cover" component={Cover} width={W} height={H} defaultProps={{ timeline: defaultTimeline } satisfies Props} />
  </>
)
