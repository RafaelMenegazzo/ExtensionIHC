document.querySelector("#btn-start").addEventListener("click", () => {
    chrome.runtime.sendMessage({
        type: 'OPEN_MIC'
    })
})


