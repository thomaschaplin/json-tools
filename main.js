function dropJSON(targetEl, callback) {
    targetEl.addEventListener('dragenter', function (e) { e.preventDefault(); });
    targetEl.addEventListener('dragover', function (e) { e.preventDefault(); });

    targetEl.addEventListener('drop', function (event) {

        var reader = new FileReader();
        reader.onloadend = function () {
            if (isValidJson(this.result) === true) {
                var data = JSON.parse(this.result);
                callback(data);
            } else if (isValidJson5(this.result) === true) {
                var data = JSON5.parse(this.result);
                callback(data);
            } else alert(`Not a valid JSON / JSON5 file`)
        };

        reader.readAsText(event.dataTransfer.files[0]);
        event.preventDefault();
    });
}

dropJSON(
    document.getElementById(`body`),
    function (data) {
        if (isValidJson() === true) {
            document.getElementById('jsonField').value = JSON.stringify(data);
            blankText()
        } else if (isValidJson5() === true) {
            document.getElementById('jsonField').value = JSON5.stringify(data);
            blankText()
        } else {
            alert("Unhandled exception")
        }
    }
);

function prettyPrint() {
    let textToCopy = document.getElementById(`jsonField`).value
    if (isValidJson() === true) {
        let x = JSON.parse(textToCopy)
        document.getElementById(`jsonField`).value = JSON.stringify(x, undefined, 2)
    } else if (isValidJson5() === true) {
        let x = JSON5.parse(textToCopy)
        document.getElementById(`jsonField`).value = JSON5.stringify(x, undefined, 2)
    } else if (isValidJson() === false || isValidJson() === false) {
        validateJson()
        validateJson5()
    } else {
        alert("Unhandled exception")
    }
}

function minify() {
    let textToCopy = document.getElementById(`jsonField`).value
    if (isValidJson() === true) {
        let x = JSON.parse(textToCopy)
        document.getElementById(`jsonField`).value = JSON.stringify(x)
    } else if (isValidJson5() === true) {
        let x = JSON5.parse(textToCopy)
        document.getElementById(`jsonField`).value = JSON5.stringify(x)
    } else if (isValidJson() === false || isValidJson() === false) {
        validateJson()
        validateJson5()
    } else {
        alert("Unhandled exception")
    }
}

function downloadJson() {
    var element = document.createElement("a");
    let textToCopy = document.getElementById(`jsonField`)
    var ugly = document.getElementById('jsonField').value

    if (isValidJson() === true) {
        try {
            var obj = JSON.parse(ugly)
            var pretty = JSON.stringify(obj, undefined, 2)
            JSON.parse(textToCopy.value)
            document.getElementById('jsonField').value = pretty
            element.setAttribute("href", "data:application/json;charset=utf-8," + encodeURIComponent(pretty));
            element.setAttribute("download", currentTime() + ".json");
            element.style.display = "none";
            document.body.appendChild(element);
            element.click();
        } catch (err) {
            alert(err)
        }
    } else if (isValidJson5() === true) {
        try {
            var obj = JSON5.parse(ugly)
            var pretty = JSON5.stringify(obj, undefined, 2)
            JSON5.parse(textToCopy.value)
            document.getElementById('jsonField').value = pretty
            element.setAttribute("href", "data:application/json;charset=utf-8," + encodeURIComponent(pretty));
            element.setAttribute("download", currentTime() + ".json");
            element.style.display = "none";
            document.body.appendChild(element);
            element.click();
        } catch (err) {
            alert(err)
        }
    } else {
        alert("Unhandled exception")
    }
}

function currentTime() {
    return Math.round(new Date().getTime() / 1000).toString()
}

function copyText(t) {
    let textToCopy = document.getElementById(`jsonField`)
    textToCopy.select()
    document.execCommand("copy")
}

function validateJson() {
    let textToCopy = document.getElementById(`jsonField`)
    try {
        JSON.parse(textToCopy.value)
        alert("Valid JSON")
    } catch (err) {
        alert(err)
    }
}
function isValidJson() {
    let textToCopy = document.getElementById(`jsonField`)
    try {
        JSON.parse(textToCopy.value)
        return true
    } catch (err) {
        return false
    }
}

function isValidJson5() {
    let textToCopy = document.getElementById(`jsonField`).value
    try {
        JSON5.parse(textToCopy)
        return true
    } catch (err) {
        return false
    }
}

function validateJson5() {
    let textToCopy = document.getElementById(`jsonField`).value
    try {
        JSON5.parse(textToCopy)
        alert("Valid JSON5")
    } catch (err) {
        alert(err)
    }
}

function blankText() {
    const btnList = $('.btn')
    const flag = document.getElementById("jsonField").value === ""
    for (let i in btnList) {
        btnList[i].disabled = flag
    }
}

function clearText() {
    document.getElementById('jsonField').value = ""
    blankText()
}
