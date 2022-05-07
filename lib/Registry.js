// Setup debug before anything else is imported
import './Resources/SetupDebug.js'

import LogController from './Log/Controller.js'

import BankController from './Bank/Controller.js'
import CloudController from './Cloud/Controller.js'
import GraphicsController from './Graphics/Controller.js'
import GraphicsPreview from './Graphics/Preview.js'
import DataCache from './Data/Cache.js'
import DataController from './Data/Controller.js'
import DataDatabase from './Data/Database.js'
import DataUserConfig from './Data/UserConfig.js'
import InstanceController from './Instance/Controller.js'
import InternalController from './Internal/Controller.js'
import PageController from './Page/Controller.js'
import ServiceController from './Service/Controller.js'
import SurfaceController from './Surface/Controller.js'
import TriggersController from './Triggers/Controller.js'
import UIController from './UI/Controller.js'
import UIHandler from './UI/Handler.js'

import EventEmitter from 'events'

global.MAX_BUTTONS = 32
global.MAX_BUTTONS_PER_ROW = 8

import fs from 'fs-extra'
import createDebug from './Log/Debug.js'
import express from 'express'
import { sendOverIpc } from './Resources/Util.js'

const debug = createDebug('app', 'App')

const pkgInfoStr = await fs.readFile(new URL('../package.json', import.meta.url))
const pkgInfo = JSON.parse(pkgInfoStr.toString())
let buildNumber
try {
	buildNumber = fs
		.readFileSync(new URL('../BUILD', import.meta.url))
		.toString()
		.trim()
} catch (e) {
	console.error('Companion cannot start as the "BUILD" file is missing')
	console.error('If you are running from source, you can generate it by running: yarn build:writefile')
	process.exit(1)
}

if (process.env.COMPANION_IPC_PARENT && !process.send) {
	console.error('COMPANION_IPC_PARENT is set, but process.send is undefined')
	process.exit(1)
}

/**
 * The core controller that sets up all the controllers needed
 * for the app.
 *
 * @extends EventEmitter
 * @author Håkon Nessjøen <haakon@bitfocus.io>
 * @author Keith Rocheck <keith.rocheck@gmail.com>
 * @author William Viker <william@bitfocus.io>
 * @author Julian Waller <me@julusian.co.uk>
 * @since 2.3.0
 * @copyright 2022 Bitfocus AS
 * @license
 * This program is free software.
 * You should have received a copy of the MIT licence as well as the Bitfocus
 * Individual Contributor License Agreement for Companion along with
 * this program.
 *
 * You can be released from the requirements of the license by purchasing
 * a commercial license. Buying such a license is mandatory as soon as you
 * develop commercial activities involving the Companion software without
 * disclosing the source code of your own applications.
 */
class Registry extends EventEmitter {
	/**
	 * The core bank controller
	 * @type {BankController}
	 * @access public
	 */
	bank
	/**
	 * The disk cache library
	 * @type {DataCache}
	 * @access public
	 */
	cache
	/**
	 * The core database library
	 * @type {DataDatabase}
	 * @access public
	 */
	db
	/**
	 * The debugger for this class
	 * @type {function}
	 * @access protected
	 */
	debug = createDebug('lib/Registry', 'registry')
	/**
	 * The core graphics controller
	 * @type {GraphicsController}
	 * @access public
	 */
	graphics
	/**
	 * The core instance controller
	 * @type {InstanceController}
	 * @access public
	 */
	instance
	/**
	 * The core interface client
	 * @type {UIHandler}
	 * @access public
	 */
	io
	/**
	 * The logger
	 * @type {LogController}
	 * @access public
	 */
	log
	/**
	 * The core page controller
	 * @type {PageController}
	 * @access public
	 */
	page
	/**
	 * The core page controller
	 * @type {GraphicsPreview}
	 * @access public
	 */
	preview
	/**
	 * The core service controller
	 * @type {ServiceController}
	 * @access public
	 */
	services
	/**
	 * The core device controller
	 * @type {SurfaceController}
	 * @access public
	 */
	surfaces
	/**
	 * The modules' event emitter interface
	 * @type {EventEmitter}
	 * @access public
	 */
	system
	/**
	 * The core schedule controller
	 * @type {TriggersController}
	 * @access public
	 */
	triggers
	/**
	 * The core user config manager
	 * @type {DataUserConfig}
	 * @access public
	 */
	userconfig

	/**
	 * The 'internal' module
	 * @type {InternalController}
	 * @access public
	 */
	internalModule

	/*
	 * Express Router for /int api endpoints
	 */
	api_router

	/**
	 * Create a new application <code>Registry</code>
	 * @param {string} configDir - the configuration path
	 * @param {string} machineId - the machine uuid
	 */
	constructor(configDir, machineId) {
		super()

		if (!configDir) throw new Error(`Missing configDir`)
		if (!machineId) throw new Error(`Missing machineId`)

		debug('configuration directory', configDir)

		this.configDir = configDir
		this.machineId = machineId
		this.appVersion = pkgInfo.version
		this.appBuild = buildNumber.replace(/^-/, '')
		this.pkgInfo = pkgInfo

		this.log = global.logger
	}

	/**
	 * Startup the application
	 * @param {string} extraModulePath - extra directory to search for modules
	 * @param {string} bind_ip
	 * @param {number} http_port
	 */
	async ready(extraModulePath, bind_ip, http_port) {
		this.debug('launching core modules')

		this.api_router = new express.Router()
		this.ui = new UIController(this)
		this.io = this.ui.io
		this.db = new DataDatabase(this)
		this.data = new DataController(this)
		this.cache = this.data.cache
		this.userconfig = this.data.userconfig
		this.log.init(this)
		this.page = new PageController(this)
		this.bank = new BankController(this)
		this.graphics = new GraphicsController(this)
		this.preview = new GraphicsPreview(this)
		this.surfaces = new SurfaceController(this)
		this.instance = new InstanceController(this)
		this.triggers = new TriggersController(this)
		this.services = new ServiceController(this)
		this.cloud = new CloudController(this)
		this.internalModule = new InternalController(this)

		// old 'modules_loaded' events
		this.data.metrics.setCycle()
		this.data.importExport.loadData()
		this.triggers.onSystemReady()

		this.bank.verifyInstanceIds()
		this.instance.variable.custom.init()
		this.graphics.regenerateAll(false)

		// We are ready to start the instances
		await this.instance.initInstances(extraModulePath)

		// Instances are loaded, start up http
		this.rebindHttp(bind_ip, http_port)

		if (process.env.COMPANION_IPC_PARENT) {
			process.on('message', (msg) => {
				try {
					if (msg.messageType === 'http-rebind') {
						this.rebindHttp(msg.ip, msg.port)
					} else if (msg.messageType === 'exit') {
						this.exit(false, false)
					} else if (msg.messageType === 'scan-usb') {
						this.surfaces.refreshDevices().catch((e) => {
							sendOverIpc({
								messageType: 'show-error',
								title: 'Scan Error',
								body: 'Failed to scan for USB devices.',
							})
						})
					} else if (msg.messageType === 'power-status') {
						this.instance.powerStatusChange(msg.status)
					}
				} catch (e) {
					this.debug(`Failed to handle IPC message: ${e}`)
				}
			})
		}
	}

	exit(fromInternal, restart) {
		Promise.resolve().then(async () => {
			console.log('somewhere, the system wants to exit. kthxbai')

			try {
				this.surfaces.quit()
			} catch (e) {
				//do nothing
			}

			try {
				await this.instance.destroyAllInstances()
			} catch (e) {
				//do nothing
			}

			if (fromInternal) {
				// Inform the parent that we are shutting down
				sendOverIpc({
					messageType: 'exit',
					restart,
				})
			}

			this.log.close()

			setImmediate(function () {
				process.exit()
			})
		})
	}

	/**
	 * Rebind the http server to an ip and port (https will update to the same ip if running)
	 * @param {string} bind_ip
	 * @param {number} http_port
	 */
	rebindHttp(bind_ip, http_port) {
		// ensure the port looks reasonable
		if (http_port < 1024 || http_port > 65535) {
			http_port = 8000
		}

		this.emit('http_rebind', bind_ip, http_port)
	}
}

export default Registry