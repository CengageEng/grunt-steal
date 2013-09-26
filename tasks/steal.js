module.exports = function(grunt) {
    grunt.registerTask('steal', 'Build your application with StealJS', function() {
        this.requiresConfig('steal');

        var steal = grunt.config('steal'),
            done = this.async(),
            promise = require('promised-io/promise'),
            path = require('path'),
            finished = false,

            build = steal.build && steal.build.length ? steal.build : [],
            _args = '{'+(steal.baseUrl ? 'baseUrl:\'' + steal.baseUrl + '\'' : '')+'}',
            gruntDir = process.cwd(),
            instances = [],
            runSteal = function(args) {
                var deferred = new promise.Deferred();
                grunt.log.writeln('\n\nRunning: java ' + args.join(' ').replace('load(', '\'load(').replace(')', ')\'') + '\n');

                var ps = grunt.util.spawn({
                    cmd: 'java',
                    args: args
                }, function(e, result, code) {
                    if (code) {
                        grunt.log.writeln('\nAn error has occured:');
                        grunt.log.write(result.stderr);
                        deferred.reject(e);
                    } else {
                        var path = result.stdout.split(' ')[2].trim() + 'production.js';

                        exec('wc -l ' + path, function(error, results) {
                            var lineCount = results.trim().split(' ')[0];

                            if (parseInt(lineCount) > 1) {
                                grunt.log.write(result.stdout);
                                deferred.resolve();
                            }
                            else {
                                deferred.reject(path + ' failed to build.');
                            }
                        });
                    }
                });

                return deferred.promise;
            };

        var commandLineMaxThreads = parseInt(grunt.option('max-threads'));
        if (commandLineMaxThreads && commandLineMaxThreads <= 0) {
          grunt.log.error('Passed ' + commandLineMaxThreads + ' via max-threads command line option which is invalid!');
          return false;
        }
        var threadCount = commandLineMaxThreads || Math.min(require('os').cpus().length, 8);
        grunt.log.ok('Using ' + threadCount + ' threads...');

        if (!grunt.file.isDir(steal.js)) {
          grunt.log.error("Configured directory is not present: " + steal.js);
          return false;
        }
        process.chdir(steal.js || '.');

        function spawnBuild() {
            var currentBuild = build.pop();
            if (!currentBuild) {
                if (!finished) {
                    finished = true;
                    var group = promise.all(instances);
                    group.then(function(results) {
                        process.chdir(gruntDir);
                        done();
                    });
                }
                return;
            }

            var opts = typeof currentBuild === 'string' ? {
                    src: currentBuild
                } : currentBuild,
                jarPath = path.normalize(__dirname.replace('tasks', 'rhino') + '/js.jar'),
                args = ['-Xmx1024m', '-Xss2048k', '-cp', jarPath, 'org.mozilla.javascript.tools.shell.Main', '-e', '_args='+_args, '-opt', '-1', '-e', 'load("' + opts.src + '")'];
            delete opts.src;

            grunt.log.ok('jarPath: ' + jarPath);

            for (var name in opts) {
                if (opts[name]) {
                    args.push('-' + name);

                    if (typeof opts[name] !== 'boolean') {
                        args.push(opts[name]);
                    }
                }
            }
            var deferred = runSteal(args);
            instances.push(deferred);
            deferred.then(function() {
                spawnBuild();
            });
        }

        for (var i = 0; i < threadCount; i++) {
            spawnBuild();
        }
        
        return true;
    });
}
