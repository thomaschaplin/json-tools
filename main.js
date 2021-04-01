function rawJsonData() {
    return document.getElementById(`jsonField`).value
}

function validateJson() {
    try {
        JSON.parse(rawJsonData())
        alert(`Valid JSON`)
        return true
    } catch (error) {
        alert(error)
        return false
    }
}

function validateJson5() {
    try {
        JSON5.parse(rawJsonData())
        alert(`Valid JSON5`)
        return true
    } catch (error) {
        alert(error)
        return false
    }
}

function isValidJson() {
    try {
        JSON.parse(rawJsonData())
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

function isValidJson5() {
    try {
        JSON5.parse(rawJsonData())
        return true
    } catch (error) {
        console.log(error)
        return false
    }
}

function parseJson() {
    try {
        return JSON.parse(rawJsonData())
    } catch (error) {
        console.log(error)
        validateJson5()
        return false
    }
}

function parseJson5() {
    try {
        return JSON5.parse(rawJsonData())
    } catch (error) {
        console.log(error)
        validateJson5()
        return false
    }
}

function prettyPrintJson() {
    if (isValidJson() && parseJson() !== false) {
        document.getElementById(`jsonField`).value = JSON.stringify(parseJson(rawJsonData()), undefined, 2)
    } else {
        validateJson()
    }
}

function prettyPrintJson5() {
    if (isValidJson5() === true && parseJson5() !== false) {
        document.getElementById(`jsonField`).value = JSON5.stringify(parseJson5(rawJsonData()), undefined, 2)
    } else {
        validateJson5()
    }
}

function minifyJson() {
    if (isValidJson() === true && parseJson() !== false) {
        document.getElementById(`jsonField`).value = JSON.stringify(parseJson(rawJsonData()))
    } else {
        validateJson()
    }
}

function minifyJson5() {
    if (isValidJson5() === true && parseJson5() !== false) {
        document.getElementById(`jsonField`).value = JSON5.stringify(parseJson5(rawJsonData()))
    } else {
        validateJson5()
    }
}

function downloadJson() {
    let element = document.createElement(`a`)
    try {
        element.setAttribute(`href`, `data:application/json;charset=utf-8,` + encodeURIComponent(rawJsonData()))
        element.setAttribute(`download`, currentTime() + `.json`)
        element.style.display = `none`
        document.body.appendChild(element)
        element.click()
    } catch (error) {
        alert(error)
    }
}

function copyText() {
    document.getElementById(`jsonField`).select()
    document.execCommand(`copy`)
}

function blankText() {
    const btnList = $(`.btn`)
    const flag = rawJsonData() === ``
    for (let i in btnList) {
        btnList[i].disabled = flag
    }
}

function clearText() {
    document.getElementById(`jsonField`).value = ``
    blankText()
}

function currentTime() {
    return Math.round(new Date().getTime() / 1000).toString()
}

function dropJSON(targetEl, callback) {
    targetEl.addEventListener(`dragenter`, function (e) { e.preventDefault() })
    targetEl.addEventListener(`dragover`, function (e) { e.preventDefault() })

    targetEl.addEventListener(`drop`, function (event) {
        var reader = new FileReader()
        reader.onloadend = function () {
            var data = this.result
            callback(data)
        }
        reader.readAsText(event.dataTransfer.files[0])
        event.preventDefault()
    })
}

dropJSON(
    document.getElementById(`body`),
    function (data) {
        document.getElementById(`jsonField`).value = data
        blankText()
    }
)
