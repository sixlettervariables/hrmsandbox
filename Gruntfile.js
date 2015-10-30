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
  browserify: {
    dist: {
      files: {
        'build/hrm-browser.js': ['lib/hrm-engine.js']
      },
      options: {
        alias: {
          'hrmsandbox': './lib/hrm-engine.js'
        }
      }
    },
  },
  uglify: {
    options: {
      preserveComments: false,
      mangle: false,
      banner: '/*! <%= pkg.name %> - v<%= pkg.version %> - ' +
              '<%= grunt.template.today("yyyy-mm-dd") %> */'
    },
    hrmBrowser: {
      files: {
        'build/hrm-browser.min.js': ['build/hrm-browser.js']
      }
    }
  }
});

grunt.loadNpmTasks('grunt-contrib-jshint');
grunt.loadNpmTasks('grunt-contrib-uglify');
grunt.loadNpmTasks('grunt-browserify');

grunt.registerTask('default', ['browserify', 'uglify']);
