function prettyPrint() {
    let textToCopy = document.getElementById(`jsonField`)
    var ugly = document.getElementById('jsonField').value
    try {
        var obj = JSON.parse(ugly)
        var pretty = JSON.stringify(obj, undefined, 2)
        JSON.parse(textToCopy.value)
        document.getElementById('jsonField').value = pretty
    } catch (err) {
        alert(err)
    }
}
function minify() {
    let textToCopy = document.getElementById(`jsonField`)
    var ugly = document.getElementById('jsonField').value
    try {
        var obj = JSON.parse(ugly)
        var pretty = JSON.stringify(obj)
        JSON.parse(textToCopy.value)
        document.getElementById('jsonField').value = pretty
    } catch (err) {
        alert(err)
    }
}
function downloadJson() {
    var element = document.createElement("a");
    let textToCopy = document.getElementById(`jsonField`)
    var ugly = document.getElementById('jsonField').value
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
