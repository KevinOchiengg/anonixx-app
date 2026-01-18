import React from 'react'
import {
  View,
  Modal,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  StatusBar,
} from 'react-native'
import { X, ChevronLeft, ChevronRight } from 'lucide-react-native'

const { width, height } = Dimensions.get('window')

export default function ImageViewer({
  visible,
  images,
  currentIndex,
  onClose,
  onIndexChange,
}) {
  const [index, setIndex] = React.useState(currentIndex)

  React.useEffect(() => {
    setIndex(currentIndex)
  }, [currentIndex])

  const handleNext = () => {
    if (index < images.length - 1) {
      const newIndex = index + 1
      setIndex(newIndex)
      onIndexChange?.(newIndex)
    }
  }

  const handlePrev = () => {
    if (index > 0) {
      const newIndex = index - 1
      setIndex(newIndex)
      onIndexChange?.(newIndex)
    }
  }

  if (!visible || !images || images.length === 0) return null

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType='fade'
      onRequestClose={onClose}
    >
      <StatusBar barStyle='light-content' backgroundColor='#000000' />
      <View style={styles.container}>
        {/* Close Button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <X size={28} color='#ffffff' />
        </TouchableOpacity>

        {/* Image Counter */}
        {images.length > 1 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {index + 1} / {images.length}
            </Text>
          </View>
        )}

        {/* Image Display */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          maximumZoomScale={3}
          minimumZoomScale={1}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          <Image
            source={{ uri: images[index] }}
            style={styles.image}
            resizeMode='contain'
          />
        </ScrollView>

        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            {index > 0 && (
              <TouchableOpacity style={styles.prevButton} onPress={handlePrev}>
                <ChevronLeft size={32} color='#ffffff' />
              </TouchableOpacity>
            )}

            {index < images.length - 1 && (
              <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                <ChevronRight size={32} color='#ffffff' />
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Thumbnail Strip (if multiple images) */}
        {images.length > 1 && (
          <View style={styles.thumbnailStrip}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailContent}
            >
              {images.map((uri, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    setIndex(i)
                    onIndexChange?.(i)
                  }}
                  style={[
                    styles.thumbnail,
                    i === index && styles.thumbnailActive,
                  ]}
                >
                  <Image
                    source={{ uri }}
                    style={styles.thumbnailImage}
                    resizeMode='cover'
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 12,
    borderRadius: 24,
  },
  counter: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 10,
    alignItems: 'center',
  },
  counterText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width,
    height: height,
  },
  prevButton: {
    position: 'absolute',
    left: 20,
    top: '50%',
    marginTop: -24,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 12,
    borderRadius: 24,
  },
  nextButton: {
    position: 'absolute',
    right: 20,
    top: '50%',
    marginTop: -24,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 12,
    borderRadius: 24,
  },
  thumbnailStrip: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    height: 80,
  },
  thumbnailContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  thumbnailActive: {
    borderColor: '#ffffff',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
})
