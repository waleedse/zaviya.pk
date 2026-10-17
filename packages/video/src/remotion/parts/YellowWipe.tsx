import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions'
import React from 'react'
import { AbsoluteFill } from 'remotion'
import { H, W } from '../../constants'

export type YellowWipeProps = { color: string }

const SKEW = Math.round(H * Math.tan((15 * Math.PI) / 180)) // 15 degrees off vertical
const BAND = 170

const poly = (x0: number, w: number) =>
  `${x0 + SKEW - w}px 0px, ${x0 + SKEW}px 0px, ${x0}px ${H}px, ${x0 - w}px ${H}px`

const Component: React.FC<TransitionPresentationComponentProps<YellowWipeProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  if (presentationDirection === 'exiting') {
    return <AbsoluteFill>{children}</AbsoluteFill>
  }
  // leading edge goes from fully off-screen left to band fully off-screen right
  const x0 = -SKEW + presentationProgress * (W + SKEW + BAND + 60)
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `polygon(0px 0px, ${x0 + SKEW}px 0px, ${x0}px ${H}px, 0px ${H}px)` }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `polygon(${poly(x0, BAND)})`, background: passedProps.color }} />
      <AbsoluteFill style={{ clipPath: `polygon(${poly(x0 - BAND - 26, 22)})`, background: 'rgba(255,255,255,0.75)' }} />
    </AbsoluteFill>
  )
}

/** A diagonal (15 degrees) band of brand colour sweeps across and reveals the next scene behind it. */
export const yellowWipe = (props: YellowWipeProps): TransitionPresentation<YellowWipeProps> => ({
  component: Component,
  props,
})
