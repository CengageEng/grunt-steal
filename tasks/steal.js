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
                    var buildOutput = result.stdout;
                    var path = buildOutput.split(' ')[2].trim() + 'production.js';
                    if(e || !grunt.file.exists(path)) {
                        deferred.reject('Problem creating '+ path + '\n' + result.stderr + '\nNo output file generated.\n');
                        return;
                    }
                    
                    var content = grunt.file.read(path).trim();
                    var lines = content.split('\n');
                    if(content.charAt(0) === '#' || lines.count <= 1) {
                        deferred.reject('Problem creating ' + path + '\n' + result.stderr + '\nOutput generated is: \n' + content);
                        return;
                    } 
                    
                    grunt.log.write(buildOutput);
                    deferred.resolve();
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
