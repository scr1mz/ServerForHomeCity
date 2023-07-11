const Router = require('express')
const router = new Router()
const objectController = require ('../controller/object.controller')

router.post('/object', objectController.createObject)
router.get('/objects', objectController.getObjects)
router.get('/object/:id', objectController.getOneObject)
router.get('/object/:object_id/ownership', objectController.getObjectOwnership);
router.put('/object/:object_id/agent', objectController.addObjectAgent);
router.put('/object/:object_id/category', objectController.updateObjectCategory);
router.put('/object', objectController.updateObject)
router.put('/object/agent', objectController.updateObjectAgent)
router.delete('/object/:id', objectController.deleteObject)

module.exports = router
