import { motion } from 'framer-motion'

interface LoadingSpinnerProps {
  message?: string
  fullScreen?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingSpinner({ message = 'Loading...', fullScreen = false, size = 'md' }: LoadingSpinnerProps) {
  const sizeMap = {
    sm: { 
      logo: 'w-12 h-12 sm:w-16 sm:h-16', 
      ring: 'w-20 h-20 sm:w-24 sm:h-24',
      dots: 'w-2 h-2 sm:w-3 sm:h-3',
      orbit: 60
    },
    md: { 
      logo: 'w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24', 
      ring: 'w-28 h-28 sm:w-32 sm:h-32 md:w-40 md:h-40',
      dots: 'w-2.5 h-2.5 sm:w-3 sm:h-3',
      orbit: 70
    },
    lg: { 
      logo: 'w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32', 
      ring: 'w-36 h-36 sm:w-44 sm:h-44 md:w-52 md:h-52 lg:w-56 lg:h-56',
      dots: 'w-3 h-3 sm:w-3.5 sm:h-3.5',
      orbit: 80
    },
  }

  const containerClass = fullScreen
    ? 'fixed inset-0 flex min-h-screen w-full items-center justify-center bg-background/80 backdrop-blur-sm z-50 p-4 loading-spinner-container'
    : 'flex flex-col items-center justify-center w-full min-h-[200px] p-4 loading-spinner-container'

  return (
    <div className={containerClass}>
      <div className="relative flex items-center justify-center mx-auto">
        {/* Outer rotating ring - primary color */}
        <motion.div
          className={`absolute ${sizeMap[size].ring} rounded-full border-4 border-transparent border-t-primary border-r-primary`}
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />

        {/* Middle rotating ring - secondary color (opposite direction) */}
        <motion.div
          className={`absolute ${sizeMap[size].ring} rounded-full border-4 border-transparent border-b-secondary border-l-secondary`}
          animate={{ rotate: -360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />

        {/* Inner pulsing ring - accent color */}
        <motion.div
          className={`absolute ${sizeMap[size].ring} rounded-full border-2 border-accent/30`}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Logo center */}
        <motion.div
          className={`relative ${sizeMap[size].logo} flex items-center justify-center animate-float`}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <img
            src="/logo1.png"
            alt="Loading"
            className="w-full h-full object-contain drop-shadow-lg filter brightness-110"
          />
        </motion.div>

        {/* Floating dots around logo */}
        {[0, 120, 240].map((angle, i) => (
          <motion.div
            key={i}
            className={`absolute ${sizeMap[size].dots} rounded-full bg-gradient-to-r from-primary to-secondary shadow-lg shadow-primary/50 animate-pulse-glow`}
            animate={{
              rotate: 360,
              x: Math.cos((angle * Math.PI) / 180) * sizeMap[size].orbit,
              y: Math.sin((angle * Math.PI) / 180) * sizeMap[size].orbit,
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'linear',
              delay: i * 0.3,
            }}
          />
        ))}
      </div>

      {/* Loading message */}
      {message && (
        <motion.p
          className="mt-6 sm:mt-8 text-center text-foreground font-medium text-sm sm:text-base md:text-lg px-4 max-w-xs sm:max-w-sm md:max-w-md loading-spinner-message"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          {message}
        </motion.p>
      )}
    </div>
  )
}
