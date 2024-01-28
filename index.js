const Client = require('ssh2').Client;

/**
 * Settings for configuring DockerManager.
 * @typedef {Object} DockerManagerSettings
 * @property {string} sshHost - SSH host for connecting to Docker.
 * @property {number} sshPort - SSH port for connecting to Docker.
 * @property {string} sshUsername - SSH username for connecting to Docker.
 * @property {string} sshPassword - SSH password for connecting to Docker.
 */


class DockerManager {
    /**
     * Constructor for DockerManager.
     * @param {DockerManagerSettings} sshSettings - SSH settings for connecting to Docker.
     * @throws {TypeError} Will throw an error if SSH parameters are not provided as an object.
     * @throws {Error} Will throw an error if SSH parameters are missing or invalid.
     */


    constructor(sshSettings) {
        if (!sshSettings || typeof sshSettings !== 'object') {
            throw new TypeError('SSH parameters must be an object');
        }
        const { sshHost, sshPort, sshUsername, sshPassword } = sshSettings
        if (typeof sshHost !== 'string' || typeof sshPort !== 'number' || typeof sshUsername !== 'string' || typeof sshPassword !== 'string') {
            throw new Error('SSH parameters must include host (string), port (number), username (string) and password (string)');
        }
        
        this.sshConfig = {
            host: sshHost,
            port: sshPort,
            username: sshUsername,
            password: sshPassword
        };


        /**
         * Gets the full Docker container ID from a short ID.
         * @param {string} id - Short Docker container ID.
         * @returns {Promise<string|null>} - Resolves with the full container ID or null if not found.
         */
        this.getFullID = (id) => {
            return new Promise((resolve, reject) => {
                const command = `docker inspect --format '{{.Id}}' ${id}`;
                const conn = new Client();

                conn.on('ready', () => {
                    conn.exec(command, (err, stream) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        let data = '';
                        stream.on('data', (chunk) => {
                            data += chunk.toString('utf8');
                        });

                        stream.on('end', () => {
                            const trimmedData = data.trim();
                            if (trimmedData) {
                                resolve(trimmedData);
                            } else {
                                resolve(null);
                            }
                            conn.end();
                        });

                    });
                });

                conn.on('error', (err) => {
                    reject(err);
                });

                conn.connect(this.sshConfig);
            });
        };

        /**
         * Executes a Docker command via SSH.
         * @param {string} command - Docker command to execute.
         * @param {string|null} containerId - Docker container ID.
         * @param {string[]} additionalArgs - Additional arguments for the Docker command.
         * @param {boolean} streaming - Indicates if streaming output is enabled.
         * @param {function} callback - Callback function for streaming output.
         * @returns {Promise<*>} - Resolves with the command output or null if not found.
         */
        this.executeDockerCommand = (command, containerId = null, additionalArgs = [], streaming = false, callback) => {

            return new Promise(async (resolve, reject) => {
                if (containerId.length == 12) {
                    containerId = await this.getFullId(containerId)
                }

                if (additionalArgs && typeof additionalArgs !== 'object') {
                    throw new ETyperror('Additional arguments must be an object')
                }

                if (!additionalArgs || additionalArgs == null) {
                    additionalArgs = []
                }

                const conn = new Client();
                conn.on('ready', function () {

                    const dockerCommand = `docker ${command} ${containerId !== false ? `${containerId}` : ''} ${additionalArgs.join(' ')}`;
                    conn.exec(dockerCommand, function (err, stream) {

                        if (err) reject(err);
                        let data = '';

                        stream.on('data', function (chunk) {
                            data += chunk;
                            if (streaming) {
                                let chunkString = chunk.toString()
                                callback(chunkString);
                            }
                        });

                        stream.on('end', function () {
                            if (data.trim().includes('No such container')) {
                                resolve(null)
                                conn.end();
                                return
                            }

                            if (data.trim() == containerId) {
                                resolve(true);
                                conn.end();
                                return
                            }

                            if (command == 'inspect') {
                                data = JSON.parse(data.trim())[0]
                                const array = {
                                    DockerID: data.Id,
                                    CreatedAt: data.Created,
                                    Status: data.State.Status,
                                    Running: data.State.Running,
                                    Paused: data.State.Paused,
                                    Restarting: data.State.Restarting,
                                    IsDead: data.State.Dead,
                                    Pid: data.State.Pid,
                                    ExitCode: data.State.ExitCode,
                                    Error: data.State.Error,
                                    StartAt: data.State.StartedAt,
                                    StopAt: data.State.FinishedAt,
                                    Image: data.Image,
                                    RestartedCount: data.RestartCount,
                                    Paths: {
                                        Path: data.Path,
                                        ResolveConf: data.ResolveConfPath,
                                        Hostname: data.HostnamePath,
                                        Log: data.LogPath,
                                        HostConfig: data.HostConfig.Binds,
                                        MaskedPaths: data.MaskedPaths,
                                        ReadonlyPaths: data.ReadonlyPaths,
                                        Mounts: data.Mounts,
                                    },
                                    Network: data.NetworkSettings,
                                    Config: {
                                        HostConfig: data.HostConfig,
                                        Platform: data.Platform,
                                        Hostname: data.Config.Hostname,
                                        Domainname: data.Config.Domainname,
                                        User: data.Config.User,
                                        AttachStdin: data.Config.AttachStdin,
                                        AttachStdout: data.Config.AttachStdout,
                                        AttachStderr: data.Config.AttachStderr,
                                        OpensPorts: data.Config.ExposedPorts,
                                        TTY: data.Config.Tty,
                                        OpenStdin: data.Config.OpenStdin,
                                        StdinOnce: data.Config.StdinOnce,
                                        VarEnv: data.Config.Env,
                                        CMD: data.Config.Cmd,
                                        HealthCheck: data.Config.HealthCheck,
                                        Image: data.Config.Image,
                                        Volumes: data.Config.Volumes,
                                        WorkDir: data.Config.WorkingDir,
                                        EntryPoint: data.Config.EntryPoint,
                                        Labels: data.Config.Labels
                                    },
                                    FullDatas: data
                                }
                                resolve(array)
                                conn.end();
                                return
                            }

                            resolve(data.trim())
                            conn.end();

                        });
                    });
                }).connect(this.sshConfig);
            });
        };
    };

    getFullId = (shortID) => {
        if (typeof shortID !== 'string') {
            throw new TypeError('The ID must be a string');
        }
        if (shortID.length !== 12) {
            throw new TypeError('The ID must be a shortID (12 chars)');
        }
        return this.getFullID(shortID);
    }

    start(containerId, checkpoint = false, checkpoint_dir = false, attach = false, detach_keys = false, interactive = false) {
        if (checkpoint) {
            if (!checkpoint_dir) {
                throw new Error('Fill in the checkpoint path, add the path in 3rd parameter');
            }
        }
        if (checkpoint || checkpoint_dir) {
            console.warn('Checkpoints are in experimental (deamon)')
        }
        return this.executeDockerCommand(`start
        ${attach !== false ? ` --attach ${attach}` : ''}
        ${checkpoint !== false ? ` --checkpoint ${checkpoint}` : ''}
        ${checkpoint_dir !== false ? ` --checkpoint-dir ${checkpoint_dir}` : ''}
        ${detach_keys !== false ? ` --detach-keys ${detach_keys}` : ''}
        ${interactive !== false ? ` --interactive ${interactive}` : ''}`, containerId);
    }

    stop(containerId, delay = false) {
        if (typeof delay !== 'boolean') {
            if (typeof delay !== 'number') {
                throw new Error('The "delay" argument must be a numeric integer')
            }
        }
        return this.executeDockerCommand(`stop 
        ${delay !== false ? ` --time ${delay}` : ''}`, containerId);
    }

    rename(containerId, newName) {
        return this.executeDockerCommand(`rename
        ${newName}`, containerId)
    }

    suspend(containerId) {
        return this.executeDockerCommand('pause', containerId);
    }

    restart(containerId, delay = false) {
        if (typeof delay !== 'boolean') {
            if (typeof delay !== 'number') {
                throw new TypeError('The "delay" argument must be a numeric integer')
            }
        }
        return this.executeDockerCommand(`restart 
        ${delay !== false ? ` --time ${delay}` : ''}`, containerId);
    }

    getInfos(containerId) {
        return this.executeDockerCommand(`inspect`, containerId, null);
    }

    delete(containerId, force = false, link = false, volume = false) {
        if (typeof force !== 'boolean') {
            throw new TypeError('The "Force" argument must be a Boolean')
        }

        if (typeof link !== 'boolean' && typeof link !== 'string') {
            throw new TypeError('The "link" argument must be a boolean or a string')
        }

        if (typeof volume !== 'boolean' && typeof volume !== 'string') {
            throw new TypeError('The "volume" argument must be a boolean or a string')
        }

        return this.executeDockerCommand(`rm 
        ${force !== false ? ' --force' : ''} 
        ${link !== false ? ` --link ${link}` : ''}
        ${volume !== false ? ` --volume ${volume}` : ''}`, containerId, null)

    }
    async log(containerId, stream = false, callback) {
        if (typeof stream !== 'boolean') {
            throw new TypeError('The "stream" argument must be a boolean')
        }

        if (callback !== null && callback == 'undefined') {
            if (typeof callback !== 'function') {
                throw new Error('Callback must return a function')
            }
        }

        if (stream) {
            if (typeof callback !== 'function') {
                throw new TypeError('Callback must return a function')
            }
            this.executeDockerCommand(`logs --follow `, containerId, null, true, (result) => {
                callback(result)
            });
        }
        return this.executeDockerCommand('logs', containerId, null)
    }

    /**
     * Creates a Docker container based on the provided settings.
     * @param {Object} settings - Settings for creating the Docker container.
     * @returns {Promise<*>} - Resolves with the result of the create command.
     * @throws {TypeError} Will throw an error if settings are not provided as an object.
     */
    create(settings) {
        if (typeof settings !== 'object') {
            throw new TypeError('The settings argument must be an object')
        }
        const argument = [];
        for (const [key, value] of Object.entries(settings)) {
            if (value === true) {
                argument.push(`--${key}`);
            } else if (value !== false) {
                if (Array.isArray(value)) {
                    argument.push(...value.map(val => `--${key} ${val}`));
                } else {
                    argument.push(`--${key} ${value}`);
                }
            } else {
                argument.push(`--${key}`);
            }
        }
        return this.executeDockerCommand(`create ${argument.join(' ')}`, containerId)
    }


    /**
     * Executes a command inside a running Docker container.
     * @param {string} containerId - Docker container ID.
     * @param {string} command - Command to execute inside the container.
     * @param {string[]} additionalArgs - Additional arguments for the command.
     * @returns {Promise<*>} - Resolves with the result of the command execution.
     * @throws {TypeError} Will throw an error if additional arguments are not provided as an object.
     */
    exec(containerId, command, additionalArgs = []) {
        if (additionalArgs && typeof additionalArgs !== 'object') {
            throw new TypeError('Additional arguments must be an object')
        }
        return this.executeDockerCommand('logs', containerId, [command, ...additionalArgs]);
    }
}

module.exports = DockerManager
