module.exports = function (grunt) {
    grunt.registerTask('steal', 'Build your application with StealJS', function () {
        this.requiresConfig('steal');

        var steal = grunt.config('steal'),
            done = this.async(),
            promise = require('promised-io/promise'),
            finished = false,

            build = steal.build && steal.build.length ? steal.build : [],
            moduleFolder = __dirname + '/..',
            js = moduleFolder + '/bin/' + (require('os').platform() === 'win32' ? 'js.bat' : 'js'),
            baseUrl = steal.baseUrl || '',
            gruntDir = process.cwd(),
            instances = [],

            runSteal = function (args) {
                var deferred = new promise.Deferred();
                grunt.log.writeln('\nRunning: ' + js + ' ' + args.join(' '));

                grunt.util.spawn({
                    cmd: js,
                    args: args
                }, function (e, result, code) {
                    if (code) {
                        grunt.log.write(result.stderr);
                        deferred.reject(e);
                    }
                    else {
                        grunt.log.write(result.stdout);
                        deferred.resolve();
                    }
                });

                return deferred.promise;
            };

        if (require('os').platform() !== 'win32') {
            require('fs').chmodSync(js, '755');
        }

        var threadCount = require('os').cpus().length;
        process.chdir(steal.js || '.');

        function spawnBuild() {
            var currentBuild = build.pop();
            if (!currentBuild) {
                if(!finished) {
                    finished = true;
                    var group = promise.all(instances);
                    group.then(function (results) {
                        done();
                    });
                }
                return;
            }

            var opts = typeof currentBuild === 'string' ? {
                    src: currentBuild
                } : currentBuild,
                args = [moduleFolder];

            args.push(opts.src);
            delete opts.src;

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
            deferred.then(function () {
                spawnBuild();
            });
        }

        for (var i = 0; i < threadCount; i++) {
            spawnBuild();
        }
    });
};