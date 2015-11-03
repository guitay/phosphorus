//author @huntbao
'use strict'

import ReqTabStore from '../../stores/reqtabstore'
import ReqConTabStore from '../../stores/reqtabconstore'

let Requester = {

    fetch(callback) {
        let tabState = ReqTabStore.getAll().reqTab
        let tabConState = ReqConTabStore.getAll().reqTabCon
        let tabIndex = tabState.activeIndex
        let tab = tabState.tabs[tabIndex]
        let tabCon = tabConState.reqCons[tabIndex]
        let method = tab.method
        let url = tab.rurl
        let headers = {}
        tabCon.builders.headerKVs.map((kv) => {
            if (kv.key && kv.value) {
                headers[kv.key] = kv.value
            }
        })
        let fetchOptions = {
            credentials: 'include',
            method: method,
            headers: headers
        }
        let res
        let startTime = Date.now()
        fetch(url, fetchOptions).then(function (response) {
            res = response
            res.time = Date.now() - startTime
            return response.text()
        }).then(function (data) {
            callback(res, data)
        }).catch(function (err) {
            callback(res, err)
        })
    }
}

export default Requester