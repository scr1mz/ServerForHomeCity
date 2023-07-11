const Router = require('express')
const router = new Router()
const utilsController = require ('../controller/utils.controller')

router.post('/utils/getLocations', utilsController.getLocations)
router.post('/utils/getAddrs', utilsController.getAddrs)
router.post('/utils/refill', utilsController.refill)

module.exports = router