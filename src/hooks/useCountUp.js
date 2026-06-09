import { useEffect, useState } from 'react'

export function useCountUp(target, duration = 1200) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let frameId

    if (target === 0) {
      frameId = requestAnimationFrame(() => setCount(0))
      return () => cancelAnimationFrame(frameId)
    }

    const start = performance.now()

    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      const ease = 1 - (1 - progress) ** 2
      setCount(Math.round(target * ease))

      if (progress < 1) frameId = requestAnimationFrame(animate)
    }

    frameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameId)
  }, [target, duration])

  return count
}
