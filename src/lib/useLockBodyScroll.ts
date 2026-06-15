import { useEffect } from 'react'

/** Prevent the page behind a modal from scrolling (incl. iOS Safari). */
export function useLockBodyScroll(active = true) {
  useEffect(() => {
    if (!active) return

    const scrollY = window.scrollY
    const { style } = document.body
    const prev = {
      position: style.position,
      top: style.top,
      width: style.width,
      overflow: style.overflow,
    }

    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.width = '100%'
    style.overflow = 'hidden'

    return () => {
      style.position = prev.position
      style.top = prev.top
      style.width = prev.width
      style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
