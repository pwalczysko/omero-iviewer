module.exports = function(config) {
  config.set({
    frameworks: ['mocha', 'chai'],
    files: ['test/build/ol3-viewer-test.js','test/unit/**/*.js'],
    exclude: ['test/unit/debug_mocha.js'],
    reporters: ['spec'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    browsers: ['ChromeHeadless'],
    autoWatch: false,
    concurrency: Infinity,
    preprocessors: {"test/build/ol3-viewer-test.js": ["babel"]}
  })
}
