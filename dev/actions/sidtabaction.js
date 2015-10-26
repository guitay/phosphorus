//author @huntbao
'use strict'

import AppConstants from '../constants/constants'
import AppDispatcher from '../dispatcher/dispatcher'

let SideTabAction = {

    switchTab(activeIndex) {
        AppDispatcher.dispatch({
            actionType: AppConstants.SIDE_TAB_CHANGE_ACTIVE_INDEX,
            activeIndex: activeIndex
        })
    }

}

export default SideTabAction