Pod::Spec.new do |s|
  s.name           = 'AnonixxCalls'
  s.version        = '1.0.0'
  s.summary        = 'Anonixx call helpers'
  s.description    = 'Proximity and audio routes for Anonixx calls'
  s.author         = 'Anonixx'
  s.homepage       = 'https://anonixx.com'
  s.license        = { type: 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
