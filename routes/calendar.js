const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { getCalendar, getNotices, getInvitable, createEvent, updateEvent, cancelEvent, deleteEvent } = require('../controllers/calendarController');

// Every role (agent, team leader, sales manager, unit manager, admin) has a calendar.
// Who can see / change what is enforced inside the controller.
router.get('/',              protect, getCalendar);
router.get('/notices',       protect, getNotices);
router.get('/invitable',     protect, getInvitable);
router.post('/',             protect, createEvent);
router.put('/:id',           protect, updateEvent);
router.patch('/:id/cancel',  protect, cancelEvent);
router.delete('/:id',        protect, deleteEvent);

module.exports = router;
