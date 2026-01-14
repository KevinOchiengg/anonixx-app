import { useSelector, useDispatch } from 'react-redux'
import { earnCoins, spendCoins } from '../store/slices/coinsSlice'

export const useCoins = () => {
  const dispatch = useDispatch()
  const { balance, streakDays } = useSelector((state) => state.coins)

  const earn = async (action, amount) => {
    try {
      await dispatch(earnCoins({ action, amount })).unwrap()
      return true
    } catch (error) {
      console.error('Earn coins failed:', error)
      return false
    }
  }

  const spend = async (item, amount) => {
    if (balance < amount) {
      return { success: false, message: 'Insufficient coins' }
    }

    try {
      await dispatch(spendCoins({ item, amount })).unwrap()
      return { success: true }
    } catch (error) {
      console.error('Spend coins failed:', error)
      return { success: false, message: error.message }
    }
  }

  return {
    balance,
    streakDays,
    earn,
    spend,
  }
}
