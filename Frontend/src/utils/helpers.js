export const formatTimeAgo = (dateString) => {
  const date = new Date(dateString)
  if (isNaN(date)) return ''
  const diff = Math.floor((Date.now() - date) / 1000)

  if (diff < 60)       return 'just now'
  if (diff < 3600)     return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800)   return `${Math.floor(diff / 86400)}d ago`
  if (diff < 2592000)  return `${Math.floor(diff / 604800)}w ago`
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`
  // ≥ 1 year — show "Jun 2023" so users never have to do mental math
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
