(function () {
  'use strict';

  var progress = 0;
  var isPaused = false;
  var startTime = Date.now();
  var totalDuration = 155000; // 2:35 total installation time in ms

  var stepPhases = [
    { name: 'Downloading core files', files: 156, duration: 45000, icon: 'ri-download-line' },
    { name: 'Extracting dependencies', files: 156, duration: 38000, icon: 'ri-library-add-line' },
    { name: 'Configuring environment', files: 156, duration: 32000, icon: 'ri-settings-3-line' },
    { name: 'Registering components', files: 156, duration: 25000, icon: 'ri-folder-add-line' },
    { name: 'Finalizing installation', files: 156, duration: 15000, icon: 'ri-check-line' }
  ];

  var progressBar = document.getElementById('progressBar');
  var progressPct = document.getElementById('progressPct');
  var etaText = document.getElementById('etaText');
  var stepsList = document.getElementById('stepsList');
  var pauseBtn = document.getElementById('pauseBtn');
  var finishBtn = document.getElementById('finishBtn');
  var mainContent = document.getElementById('mainContent');
  var completionScreen = document.getElementById('completionScreen');

  function formatTime(ms) {
    var totalSec = Math.floor(ms / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    return min + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function updateProgress() {
    if (isPaused) return;

    var elapsed = Date.now() - startTime;
    progress = Math.min(100, Math.round((elapsed / totalDuration) * 100));

    progressBar.style.width = progress + '%';
    progressPct.textContent = progress + '%';

    var remaining = Math.max(0, totalDuration - elapsed);
    etaText.textContent = 'Estimated time remaining: ' + formatTime(remaining);

    // Update step phases
    var currentStepIndex = Math.floor((progress / 100) * stepPhases.length);
    if (currentStepIndex >= stepPhases.length) currentStepIndex = stepPhases.length - 1;

    stepsList.querySelectorAll('.step-item').forEach(function (step, idx) {
      step.classList.remove('active', 'done', 'queued');

      if (idx < currentStepIndex) {
        step.classList.add('done');
        step.querySelector('.step-icon').innerHTML = '<i class="ri-check-line"></i>';
        step.querySelector('.step-time').textContent = '✓ done';
      } else if (idx === currentStepIndex) {
        step.classList.add('active');
        var phase = stepPhases[idx];
        var phaseProgress = ((progress - (idx * 100 / stepPhases.length)) / (100 / stepPhases.length)) * 100;
        var fileCurrent = Math.round((phaseProgress / 100) * phase.files);
        step.querySelector('.step-icon').innerHTML = '<i class="' + phase.icon + ' spinner"></i>';
        step.querySelector('.step-time').textContent = fileCurrent + ' MB / ' + phase.files + ' MB';
      } else {
        step.classList.add('queued');
        step.querySelector('.step-icon').innerHTML = '<i class="ri-time-line"></i>';
        step.querySelector('.step-time').textContent = '—';
      }
    });

    if (progress < 100) {
      requestAnimationFrame(updateProgress);
    } else {
      onInstallComplete();
    }
  }

  function onInstallComplete() {
    mainContent.style.display = 'none';
    completionScreen.classList.add('show');
    pauseBtn.style.display = 'none';
    finishBtn.style.display = 'flex';
    etaText.textContent = 'Installation finished successfully';
  }

  pauseBtn.addEventListener('click', function () {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
    if (!isPaused) {
      startTime = Date.now() - (totalDuration * (progress / 100));
      updateProgress();
    }
  });

  finishBtn.addEventListener('click', function () {
    window.open('../screen%20software/apolloDJ.v3.html', '_blank');
  });

  updateProgress();
})();

