/** hrmsandbox */
var grunt = require('grunt');

grunt.initConfig({
  pkg: grunt.file.readJSON('package.json'),
  jshint: {
    options: {
      browser: false,
      node: true,
    },
    all: ['Gruntfile.js', 'lib/hrm-engine.js', 'test/**/*.js']
  },
  peg: {
    options: { trackLineAndColumn: true },
    hrm: {
      src: "grammar/hrm.pegjs",
      dest: "lib/hrm.pegjs.js"
    }
  },
  browserify: {
    dist: {
      files: {
        'build/hrm-browser.js': ['lib/hrm.pegjs.js', 'lib/hrm-engine.js']
      },
      options: {
        alias: {
          'hrmsandbox': './lib/hrm-engine.js'
        }
      }
    },
  }
});

grunt.loadNpmTasks('grunt-contrib-jshint');
grunt.loadNpmTasks('grunt-peg');
grunt.loadNpmTasks('grunt-browserify');

grunt.registerTask('grammar', ['peg']);
grunt.registerTask('default', ['peg', 'jshint', 'browserify']);
