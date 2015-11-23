//author @huntbao
'use strict'

import async from 'async'
import _ from 'lodash'
import URL from 'url'
import Util from '../../libs/util'
import RequestDataMap from '../../libs/request_data_map'
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
        // deal form-data
        let bodyType = tabCon.builders.bodyType
        if (method !== 'GET') {
            switch (bodyType.type) {
                case 'form-data':
                    let fd = new FormData()
                    tabCon.builders.bodyFormDataKVs.map((kv) => {
                        if (kv.key) {
                            if (kv.valueType === 'text' && kv.value) {
                                fd.append(kv.key, kv.value)
                            } else if (kv.valueType === 'file' && kv.fileInput && kv.fileInput.files[0]) {
                                fd.append(kv.key, kv.fileInput.files[0])
                            }
                        }
                    })
                    fetchOptions.body = fd
                    break
                case 'x-www-form-urlencoded':
                    let fd1 = new FormData()
                    tabCon.builders.bodyXFormKVs.map((kv) => {
                        if (kv.key && kv.value) {
                            fd1.append(kv.key, kv.value)
                        }
                    })
                    fetchOptions.body = fd1
                    break
                case 'raw':
                    if (bodyType.value === 'application/json') {
                        fetchOptions.body = this.__getJSON(tabCon.builders.bodyRawJSONKVs)
                    } else {
                        fetchOptions.body = tabCon.builders.bodyRawData
                    }
                    break
                case 'binary':
                    let binaryFileInput = tabCon.builders.bodyBinaryFileInput
                    if (binaryFileInput && binaryFileInput.files.length === 1) {
                        let reader = new FileReader()
                        reader.onload = (e) => {
                            fetchOptions.body = reader.result
                            this.__fetch(url, fetchOptions, callback)
                        }
                        reader.readAsBinaryString(binaryFileInput.files[0])
                        return
                    }
                    break
                default:
                    break
            }
        }
        this.__fetch(url, fetchOptions, callback)
    },

    __fetch(url, options, callback) {
        let res
        let startTime = Date.now()
        fetch(url, options).then((response) => {
            res = response
            res.time = Date.now() - startTime
            return response.text()
        }).then((data) => {
            callback(res, data)
        }).catch((err) => {
            callback(res, err)
        })
    },

    __getJSON(bodyRawJSONKVs) {
        let json = {}
        let convertValue = (value, valueType) => {
            if (valueType === 'boolean') {
                return value === 'true'
            } else if (valueType === 'number') {
                return parseFloat(value) || 0
            } else {
                return value
            }
        }
        let getData = (kvs, container) => {
            kvs.forEach((kv) => {
                if (kv.key) {
                    if (kv.valueType === 'object') {
                        container[kv.key] = {}
                        getData(kv.values, container[kv.key])
                    } else if (kv.valueType === 'array') {
                        container[kv.key] = []
                        getData(kv.values, container[kv.key])
                    } else {
                        let value = convertValue(kv.value, kv.valueType)
                        if (Array.isArray(container)) {
                            let item = {}
                            item[kv.key] = value
                            container.push(item)
                        } else {
                            container[kv.key] = value
                        }
                    }
                }
            })
        }
        getData(bodyRawJSONKVs, json)
        return JSON.stringify(json)
    },

    runCollection(collection, stores, callback) {
        //console.log(collection)
        //console.log(stores)
        collection.requests.forEach((req) => {
            req.reqStatus = 'waiting'
        })
        //async.eachSeries(collection.requests, (req, cb) => {
        //    if (req.reqStatus) {
        //        req.reqStatus = 'fetching'
        //        callback()
        //        this.__getFetchOptions(req, collection, stores)
        //    } else (
        //        cb()
        //    )
        //})
        collection.requests[0].reqStatus = 'fetching'
        callback() // set waiting status
        let fetchUrl = this.__getFetchUrl(collection.requests[0], collection, stores)
        console.log(fetchUrl)
        let fetchOptions = this.__getFetchOptions(collection.requests[0], collection, stores)
        console.log(fetchOptions)
    },

    __getFetchUrl(req, collection, stores) {
        let url
        let savedRequest = _.find(stores.requests, (r) => {
            return r.id === req.id
        })
        savedRequest = savedRequest || {}
        let savedURLParams = savedRequest['url_params']
        let path = req.path
        if (req.isNEI) {
            if (Util.isNoBodyMethod(req.method)) {
                let urlParams = []
                let savedParam
                req.inputs.forEach((input) => {
                    savedParam = _.find(savedURLParams, (p) => {
                        return !p.is_pv && p.key === input.name
                    })
                    urlParams.push({
                        checked: true,
                        key: input.name,
                        value: savedParam && savedParam.value || ''
                    })
                })
                url = Util.getURLByQueryParams(path, urlParams)
            }
        } else {
            url = savedRequest.url
        }
        let urlParams = Util.getUrlParams(url)
        let savedPV
        urlParams.forEach((urlParam) => {
            if (urlParam.isPV) {
                savedPV = _.find(savedURLParams, (p) => {
                    return p.is_pv && p.key === urlParam.key
                })
                url = url.replace(':' + urlParam.key, savedPV && savedPV.value)
            }
        })
        let result = URL.parse(url)
        if (result.host) {
            return url
        }
        let hosts = stores.hosts
        return (hosts.folders[req.folderId] || hosts.collections[req.collectionId] || '') + url
    },

    __getFetchOptions(req, collection, stores) {
        let savedRequest = _.find(stores.requests, (r) => {
            return r.id === req.id
        })
        savedRequest = savedRequest || {}
        let options = {
            credentials: 'include',
            method: req.method,
            headers: {}
        }
        let getNEIBodyRawJSON = () => {
            let savedBodyRawJSONKVs = savedRequest['body_raw_json'] || []
            let savedBodyRawJSON = Util.convertKVToJSON(savedBodyRawJSONKVs)
            return Util.convertNEIInputsToJSONStr(req, collection, savedBodyRawJSON)
        }
        let getNEIXFormData = () => {
            let savedXFormData = savedRequest['body_x_form_data'] || {}
            let fd = new FormData()
            _.forEach(req.inputs, (input) => {
                let savedField = _.find(savedXFormData, (kv) => {
                    return kv.key === input.name
                })
                fd.append(input.name, savedField && savedField.value || '')
            })
            return fd
        }
        let getBodyRawJSON = () => {
            let savedBodyRawJSONKVs = savedRequest['body_raw_json'] || []
            return Util.convertKVToJSON(savedBodyRawJSONKVs)
        }
        let getXFormData = () => {
            let savedXFormData = savedRequest['body_x_form_data'] || {}
            let fd = new FormData()
            _.forEach(savedXFormData, (kv) => {
                if (kv.checked && kv.key) {
                    fd.append(kv.key, kv.value)
                }
            })
            return fd
        }
        let getFormData = () => {
            let savedFormData = savedRequest['body_form_data'] || {}
            let fd = new FormData()
            _.forEach(savedFormData, (kv) => {
                if (kv.checked && kv.key) {
                    fd.append(kv.key, kv.value)
                }
            })
            return fd
        }
        if (!Util.isNoBodyMethod(req.method)) {
            if (req.isNEI) {
                if (req.isRest) {
                    options.headers['Content-Type'] = 'application/json'
                    options.body = getNEIBodyRawJSON()
                } else {
                    options.headers['Content-Type'] = 'x-www-form-urlencoded'
                    options.body = getNEIXFormData()
                }
                req.headers.forEach((header) => {
                    options.headers[header.name] = header.defaultValue
                })
            } else {
                // deal request body
                let bodyType = savedRequest['body_type']
                // while bat running collection's requests, binary type is not taken into account
                switch (bodyType.type) {
                    case 'raw':
                        if (bodyType.value === 'application/json') {
                            options.body = getBodyRawJSON()
                        } else {
                            options.body = savedRequest['body_raw_data']
                        }
                        break

                    case 'x-www-form-urlencoded':
                        options.body = getXFormData()
                        break

                    case 'form-data':
                        options.body = getFormData()
                        break

                    default:
                        break
                }
                // deal headers
                let savedHeaders = savedRequest['headers']
                savedHeaders.forEach((header) => {
                    if (header.checked && header.key) {
                        options.headers[header.key] = header.value
                    }
                })
            }
        }
    }
}

export default Requester