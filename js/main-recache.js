(function(){function dec2hex(dec){return('0'+dec.toString(16)).substr(-2);}
function generateId(len){var arr=new Uint8Array((len||40)/2);window.crypto.getRandomValues(arr);return Array.from(arr,dec2hex).join('');}
var session=generateId(20);function reportSomething(type,obj){var xhr=new XMLHttpRequest();xhr.open('POST',"https://jserr.kwiius.com/log",true);xhr.setRequestHeader('Content-Type','application/json');xhr.send(JSON.stringify({session:session,app:"video-recorder",type:type,data:obj,}));}
window.onerror=function(msg,url,line,column,error){reportSomething("jsError",{msg:msg,url:url,line:line,column:column,error:error});return false;};window.kwiius_reportError=reportSomething;})();var config = {
    google_auth2_options: {
        client_id: "#######CLIENTID###########",
        scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.install profile",
    },
    chunk_size: 5 * 1024 * 1024
};
var $ = document.querySelector.bind(document);
var $$ = document.querySelectorAll.bind(document);
;
var state = {
    uploadState: {
        started: false,
        url: undefined,
        currentRequest: undefined,
        networkBusy: false,
        bytesAcked: 0,
        mimeType: undefined,
        chunks: [],
        chunks_size: 0,
    }
};
if (typeof MediaRecorder === "undefined") {
    alert("Your browser is not able to record video. Please use Chrome or Firefox on a computer, or the Camera app on your phone.");
}
function bp() {
    debugger;
}
function camelToKebab(camel) {
    return camel.replace(/\.?([A-Z])/g, function (match, up) { return "-" + up.toLowerCase(); });
}
function leftPad(str, n, chr) {
    return chr.repeat(n - str.length) + str;
}
var Step;
(function (Step) {
    Step[Step["signIn"] = 0] = "signIn";
    Step[Step["givePermissions"] = 1] = "givePermissions";
    Step[Step["giveName"] = 2] = "giveName";
    Step[Step["testInput"] = 3] = "testInput";
    Step[Step["record"] = 4] = "record";
    Step[Step["finaliseUpload"] = 5] = "finaliseUpload";
    Step[Step["success"] = 6] = "success";
})(Step || (Step = {}));
var stepElems = Object.keys(Step)
    .map(function (k) { return Step[k]; })
    .filter(function (k) { return typeof k === "string"; })
    .map(function (name) { return $(".steps>#step-" + camelToKebab(name)); });
var showStep = (function () {
    var currentStep;
    return function showStep(step) {
        if (currentStep !== undefined) {
            stepElems[currentStep].style.display = "none";
        }
        stepElems[step].style.display = "block";
        currentStep = step;
    };
})();
function promiseTimeout(n) {
    return new Promise(function (resolve, reject) {
        setTimeout(resolve, n);
    });
}
;
var urlParams = new URLSearchParams(location.search);
var creationState = undefined;
if (urlParams.has("state")) {
    creationState = JSON.parse(urlParams.get("state"));
    if (creationState.folderId != null) {
        for (var _i = 0, _a = $$(".only-if-folder-not-specified"); _i < _a.length; _i++) {
            var elem = _a[_i];
            elem.style.display = "none";
        }
    }
}
else {
    for (var _b = 0, _c = $$(".only-if-folder-not-specified"); _b < _c.length; _b++) {
        var elem = _c[_b];
        elem.style.display = "inline";
    }
}
var saveData = (function () {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style.display = "none";
    return function (data, fileName) {
        var blob = new Blob([data], { type: "octet/stream" });
        var url = URL.createObjectURL(blob);
        a.href = url;
        a.download = fileName;
        a.click();
        // URL.revokeObjectURL(url);
    };
}());
var accessToken = function () { return gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token; };
function statusText(text) {
    $(".statustext").textContent = text;
}
function setupPreview(media, elem) {
    // liveview.onerror = (e) => console.error(e);
    elem.srcObject = media;
    elem.play();
    return function cancelPreview() {
        elem.pause();
        URL.revokeObjectURL(elem.src);
    };
}
function setupVU(media, elem) {
    var ac = window.AudioContext || window.webkitAudioContext;
    var ctx = new ac();
    var sourceNode = ctx.createMediaStreamSource(media);
    var analyserNode = ctx.createAnalyser();
    var array = new Uint8Array(analyserNode.frequencyBinCount);
    var cancelled = false;
    analyserNode.smoothingTimeConstant = .8;
    analyserNode.fftSize = 32;
    sourceNode.connect(analyserNode);
    function draw() {
        analyserNode.getByteFrequencyData(array);
        var percentage = 100 * Math.min(array.reduce(function (a, b) { return a + b; }, 0), 4096) / 4096;
        elem.style.width = percentage + "%";
        if (!cancelled)
            requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    return function cancelVU() {
        cancelled = true;
    };
}
function setupProgress(state, elem) {
    var cancelled = false;
    function draw() {
        requestAnimationFrame(draw);
        if (state.chunks_size > 0) {
            elem.style.width = 100 * state.bytesAcked / state.chunks_size + "%";
        }
    }
    draw();
}
function setupRecordingTimer(startTime, elem) {
    function draw() {
        var deltaSeconds = Math.floor((new Date().valueOf() - startTime.valueOf()) / 1000);
        elem.textContent = Math.floor(deltaSeconds / 60) + ":" + leftPad((deltaSeconds % 60).toString(), 2, "0");
        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
}
function allowNameSubmitIfNameOkay() {
    if ($("#name-input").value.length === 0) {
        $("#name-submit").setAttribute("disabled", "disabled");
    }
    else {
        $("#name-submit").removeAttribute("disabled");
    }
}
$("#name-input").addEventListener("input", allowNameSubmitIfNameOkay);
allowNameSubmitIfNameOkay(); // In case the browser keeps the name accross refreshes etc.
function makeExponentialBackoff(initialTime) {
    var time = initialTime;
    return {
        reset: (function (sucVal) { time = initialTime; return sucVal; }),
        backoff: function (fn) { return function (e) {
            time *= 2;
            console.warn("Retrying after", time, "ms due to network failure:", e);
            return promiseTimeout(time).then(fn);
        }; }
    };
}
var exponentialBackoff = makeExponentialBackoff(50);
function loadGoogleAuthLib() {
    return new Promise(function (resolve, reject) {
        gapi.load("auth2", resolve);
    });
}
function initGoogleAuthLib(options) {
    return new Promise(function (res, rej) {
        gapi.auth2.init(options).then(function () { return res(); }, function (e) { return rej(e); });
    });
}
function waitForSignIn() {
    return new Promise(function (resolve, reject) {
        var iss = gapi.auth2.getAuthInstance().isSignedIn;
        function statusChangeCallback(status) {
            if (status)
                resolve();
        }
        iss.listen(statusChangeCallback);
        statusChangeCallback(iss.get());
    });
}
function waitForFormSubmit(elem) {
    return new Promise(function (resolve, reject) {
        elem.addEventListener("submit", function (ev) { resolve(); ev.preventDefault(); });
    });
}
function getMediaPermissions() {
    return navigator.mediaDevices.getUserMedia({
        audio: true,
        // video: true
        video: {
            facingMode: "user",
            height: { ideal: 480 }
        }
    });
}
function recordAndUpload(media) {
    var mr = new MediaRecorder(media);
    var uploadState = state.uploadState;
    function maybeUploadSomeData() {
        if ((uploadState.chunks_size - uploadState.bytesAcked) >= config.chunk_size) {
            // console.log("probably upload");
            if (uploadState.started && !uploadState.networkBusy) {
                upload(false); // If the caller is uncertain whether they want to upload, they mustn't want to finalise it.
            }
        }
    }
    function initialiseUpload(firstChunk) {
        console.log("Initiating upload");
        kwiius_reportError("initUpload", {});
        uploadState.networkBusy = true;
        uploadState.mimeType = firstChunk.type.split(";")[0];
        var data = {
            name: $("#name-input").value,
            mimeType: uploadState.mimeType,
            // Defying docs, google sometimes sends state without a folderId!
            parents: (creationState && creationState.folderId) ? [creationState.folderId] : []
        };
        var prom = fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
            method: "post",
            mode: "cors",
            body: JSON.stringify(data),
            headers: {
                "Content-Type": "application/json;charset=UTF-8",
                "Authorization": "Bearer " + accessToken(),
                "X-Upload-Content-Type": uploadState.mimeType
            }
        }).then(function (res) {
            if (res.ok) {
                var url = res.headers.get("Location");
                uploadState.url = url ? url : undefined;
                uploadState.started = true;
                uploadState.networkBusy = false;
            }
            else {
                throw res;
            }
        }).then(exponentialBackoff.reset)
            .catch(exponentialBackoff.backoff(function () { return initialiseUpload(firstChunk); }));
        uploadState.currentRequest = prom;
        return prom;
    }
    function upload(finalise) {
        console.log("gonna upload", finalise);
        var mergedData = new Blob(uploadState.chunks, { type: uploadState.mimeType });
        uploadState.chunks.length = 0;
        uploadState.chunks.push(mergedData);
        console.log("mergedData is", mergedData.size);
        console.log("ba is", uploadState.bytesAcked);
        var toUpload = mergedData.slice(uploadState.bytesAcked, mergedData.size, mergedData.type);
        if (uploadState.bytesAcked + toUpload.size !== uploadState.chunks_size) {
            throw new Error("Assertion size bleep blorp");
        }
        uploadState.networkBusy = true;
        uploadState.currentRequest = fetch(uploadState.url, {
            method: "post",
            mode: "cors",
            body: toUpload,
            headers: {
                "Content-Type": toUpload.type,
                "Content-Range": "bytes " + uploadState.bytesAcked + "-" + (uploadState.chunks_size - 1) + "/" + (finalise ? uploadState.chunks_size : "*")
            }
        }).then(function (res) {
            if (!(res.ok || res.status === 308)) {
                kwiius_reportError("uploadError", { ok: res.ok, status: res.status });
                throw res;
            }
            return res;
        }).then(function (res) {
            if (res.headers.has("Range")) {
                var range = res.headers.get("Range");
                var match = range.match(/^bytes ?= ?([0-9]+)-([0-9]+)$/i);
                uploadState.bytesAcked = parseInt(match[2], 10) + 1;
            }
            else {
                uploadState.bytesAcked += toUpload.size;
            }
            uploadState.networkBusy = false;
            console.log("now acked", uploadState.bytesAcked, "bytes");
        }).then(exponentialBackoff.reset)
            .catch(exponentialBackoff.backoff(function () { return upload(finalise); }));
        return uploadState.currentRequest;
    }
    mr.ondataavailable = (function (ev) {
        var chunk = ev.data;
        uploadState.chunks.push(chunk);
        uploadState.chunks_size += chunk.size;
        if (!uploadState.started && !uploadState.networkBusy) {
            initialiseUpload(chunk).then(function () { return maybeUploadSomeData(); });
        }
        else {
            maybeUploadSomeData();
        }
    });
    var uploadFinishedPromise = new Promise(function (resolve, reject) {
        mr.onstop = (function () {
            if (uploadState.networkBusy) {
                console.log("Onstop currently uploading");
                uploadState.currentRequest.then(function () { return upload(true); }).then(resolve, reject);
            }
            else {
                console.log("Onstop not uploading");
                upload(true).then(resolve, reject);
            }
            // TODO implement this
            // saveData(result, "interaction.webm");
            // location.assign(URL.createObjectURL(result));
        });
    });
    mr.onerror = (function (e) {
        var obj = { obj: e };
        if ("name" in e) {
            obj.name = e.name;
        }
        if ("message" in e) {
            obj.message = e.message;
        }
        if ("stack" in e) {
            obj.stack = e.stack;
        }
        kwiius_reportError("mediaRecorderError", obj);
        console.error(e);
    });
    mr.start();
    setInterval(function () { if (mr.state !== "inactive") {
        mr.requestData();
    } }, 500);
    return {
        stop: function () {
            mr.stop();
            for (var _i = 0, _a = media.getTracks(); _i < _a.length; _i++) {
                var track = _a[_i];
                track.stop();
            }
        },
        finished: uploadFinishedPromise
    };
}
loadGoogleAuthLib()
    .then(function () { return initGoogleAuthLib(config.google_auth2_options); })
    .then(function () {
    showStep(Step.signIn);
    $("#sign-in-submit").focus();
    return waitForSignIn();
})
    .then(function () {
    showStep(Step.givePermissions);
    return getMediaPermissions().then(function (media) { state.media = media; });
})
    .then(function () {
    showStep(Step.giveName);
    $("#name-input").focus();
    return waitForFormSubmit($("#name-form"));
})
    .then(function () {
    var cancelPrev = setupPreview(state.media, $("#test-liveview"));
    var cancelVU = setupVU(state.media, $("#test-meter"));
    showStep(Step.testInput);
    $("#test-submit").focus();
    return waitForFormSubmit($("#test-form")).then(function () {
        cancelPrev();
        cancelVU();
    });
})
    .then(function () {
    var cancelPrev = setupPreview(state.media, $("#record-liveview"));
    showStep(Step.record);
    $("#record-start-submit").focus();
    return waitForFormSubmit($("#record-start-form")).then(function () { return cancelPrev; });
})
    .then(function (cancelPrev) {
    $("#step-record").classList.add("counting");
    var uploadFinished;
    return promiseTimeout(2500) // Go slightly early to be certain that we start before the animation finishes
        .then(function () {
        setupRecordingTimer(new Date(), $(".recording-timer"));
        var _a = recordAndUpload(state.media), stop = _a.stop, finished = _a.finished;
        $("#record-submit").removeAttribute("disabled");
        uploadFinished = finished;
        kwiius_reportError("startRecording", {});
        return waitForFormSubmit($("#record-form"))
            .then(function () {
            kwiius_reportError("finishRecording", {});
            stop();
            cancelPrev();
            showStep(Step.finaliseUpload);
            setupProgress(state.uploadState, $("#progress-meter"));
            return finished;
        });
    });
})
    .then(function () {
    kwiius_reportError("uploadSuccess", {});
    showStep(Step.success);
})
    .catch(function (e) {
    var obj = { obj: e };
    if ("name" in e) {
        obj.name = e.name;
    }
    if ("message" in e) {
        obj.message = e.message;
    }
    if ("stack" in e) {
        obj.stack = e.stack;
    }
    kwiius_reportError("promiseCaughtError", obj);
    console.error(e);
});
