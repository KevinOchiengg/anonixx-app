import React, { createContext, useContext, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import Storage from '../services/storage' // ← Add this
import socketService from '../services/socket'

const SocketContext = createContext()

export const SocketProvider = ({ children }) => {
  const { isAuthenticated } = useSelector((state) => state.auth)
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      initializeSocket()
    } else {
      disconnectSocket()
    }

    return () => {
      disconnectSocket()
    }
  }, [isAuthenticated])

  const initializeSocket = async () => {
    try {
      const socketInstance = await socketService.connect()
      setSocket(socketInstance)
      setConnected(true)
    } catch (error) {
      console.error('Socket connection failed:', error)
    }
  }

  const disconnectSocket = () => {
    if (socket) {
      socketService.disconnect()
      setSocket(null)
      setConnected(false)
    }
  }

  return (
    <SocketContext.Provider value={{ socket, connected, socketService }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider')
  }
  return context
}
