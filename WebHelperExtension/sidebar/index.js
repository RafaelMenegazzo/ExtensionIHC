document.querySelector("#btn-start").addEventListener("click", () => {
    console.log("Clicou")
    chrome.runtime.sendMessage({
        type: 'OPEN_MIC'
    })


})