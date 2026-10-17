import React from 'react'
import { Composition, Still } from 'remotion'
import morning from '../../fixtures/morning-30.json'
import { compose } from '../compose'
import { FPS, H, TOTAL_FRAMES, W } from '../constants'
import type { EditionInput, Timeline } from '../types'
import { Cover } from './Cover'
import { DailyHeadlines } from './DailyHeadlines'

const defaultTimeline: Timeline = compose(morning as EditionInput)

type Props = { timeline: Timeline }

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
    <Still id="Cover" component={Cover} width={W} height={H} defaultProps={{ timeline: defaultTimeline } satisfies Props} />
  </>
)
