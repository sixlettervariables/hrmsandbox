/** hrmsandbox */
var grunt = require('grunt');

grunt.initConfig({
  pkg: grunt.file.readJSON('package.json'),
  jshint: {
    options: {
      browser: false,
      node: true,
    },
    node: ['Gruntfile.js', 'lib/**/*.js', 'test/**/*.js'],
    web: {
      options: {
        jquery: true,
        browser: true,
        globals: {
          HRMViewer: true,
          HrmProgram: true,
          HrmProgramState: true,
          HrmProgramError: true,
          HrmLevelData: true,
          HrmLevelInboxer: true,
          HrmLevelOutboxer: true,
          CodeMirror: true,
        }
      },
      files: {
        src: ['web/components/js/**/*.js']
      }
    }
  },
  browserify: {
    dist: {
      files: {
        'build/hrm-browser.js': ['lib/hrm-browser.js']
      }
    },
  },
  concat: {
    options: {
    },
    js: {
      src: [
        'bower_components/pako/dist/pako_inflate.js',
        'bower_components/human-resource-machine-viewer/hrm.js',
        'web/components/js/splitter.js',
        'web/components/js/hrmMode.js',
        'build/hrm-browser.js',
        'web/components/js/controller.js'
      ],
      dest: 'web/hrmfiddle-dist.js'
    },
    css: {
      src: [
        'bower_components/human-resource-machine-viewer/hrm.css',
        'web/components/css/splitter.css',
        'web/components/css/hrmfiddle.css'
      ],
      dest: 'web/hrmfiddle-dist.css'
    }
  },
  cssmin: {
    options: {

    },
    hrmFiddle: {
      files: {
        'web/hrmfiddle-dist.min.css': ['web/hrmfiddle-dist.css']
      }
    }
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
    },
    hrmFiddle: {
      files: {
        'web/hrmfiddle-dist.min.js': ['web/hrmfiddle-dist.js']
      }
    }
  }
});

grunt.loadNpmTasks('grunt-contrib-jshint');
grunt.loadNpmTasks('grunt-contrib-uglify');
grunt.loadNpmTasks('grunt-contrib-concat');
grunt.loadNpmTasks('grunt-contrib-cssmin');
grunt.loadNpmTasks('grunt-browserify');

grunt.registerTask('default', ['jshint', 'browserify', 'concat', 'uglify', 'cssmin']);
