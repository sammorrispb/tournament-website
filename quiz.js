/* ═══════════════════════════════════════════════
   Quiz Wizard — Step-by-step bracket finder
   Vanilla JS, no dependencies, safe DOM only
   ═══════════════════════════════════════════════ */

(function () {
  "use strict";

  // ─── State ───
  var state = {
    currentStep: "1",
    isVeteran: false,
    answers: {
      experience: null,
      skill: null,
      motivations: [],
      location: null,
      bracket: null,
      name: null,
      email: null,
    },
    completedSteps: 0,
  };

  // ─── Bracket scoring matrix ───
  var BRACKET_MATRIX = {
    learning:    { lt6mo: "too-early", "6mo1yr": "3.0-3.5", "1to2yr": "3.0-3.5", "2plus": "3.0-3.5" },
    consistent:  { lt6mo: "3.0-3.5",  "6mo1yr": "3.0-3.5", "1to2yr": "3.0-3.5", "2plus": "3.5-4.0" },
    competitive: { lt6mo: "3.0-3.5",  "6mo1yr": "3.5-4.0", "1to2yr": "3.5-4.0", "2plus": "3.5-4.0" },
    tournament:  { lt6mo: "3.5-4.0",  "6mo1yr": "3.5-4.0", "1to2yr": "4.0-4.5", "2plus": "4.0-4.5" },
  };

  // ─── Step ordering for each path ───
  var NEW_PATH = ["1", "2", "3", "4", "5", "6", "7"];
  var VET_PATH = ["1", "vet-a", "vet-b", "7"];

  // ─── Progress dot mapping ───
  // New path: 7 dots map to steps 1-7
  // Veteran path: collapse to 3 dots
  var NEW_DOT_MAP = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6 };
  var VET_DOT_MAP = { "1": -1, "vet-a": 0, "vet-b": 1, "7": 2 };

  // ─── DOM refs ───
  var progressBar = document.getElementById("progress-bar");
  var dots = progressBar ? progressBar.querySelectorAll(".progress__dot") : [];
  var backBtn = document.getElementById("back-btn");
  var nextBtn = document.getElementById("next-btn");
  var quizNav = document.getElementById("quiz-nav");
  var quizEmailForm = document.getElementById("quiz-email-form");
  var vetEmailForm = document.getElementById("vet-email-form");
  var earlyEmailForm = document.getElementById("early-email-form");
  var vetSkipBtn = document.getElementById("vet-skip");
  var resultsContainer = document.getElementById("quiz-results");

  // ─── Steps that hide the quiz nav ───
  var HIDE_NAV_STEPS = ["1", "6", "7", "vet-a", "vet-b", "too-early"];
  // ─── Steps that hide the back button ───
  var HIDE_BACK_STEPS = ["1", "7", "too-early"];
  // ─── Steps that hide the next button ───
  var HIDE_NEXT_STEPS = ["1", "6", "7", "vet-a", "vet-b", "too-early"];

  // ═══════════════════════════════════════════════
  // Navigation
  // ═══════════════════════════════════════════════

  function goToStep(stepId) {
    // Hide current step
    var current = document.querySelector(".step--active");
    if (current) current.classList.remove("step--active");

    // Show new step
    var next = document.querySelector('[data-step="' + stepId + '"]');
    if (next) next.classList.add("step--active");

    // Update state
    state.currentStep = stepId;
    state.completedSteps++;

    // Update progress bar
    updateProgress(stepId);

    // Update nav visibility
    updateNav(stepId);

    // Scroll to top of quiz
    var quizEl = document.querySelector(".quiz");
    if (quizEl) {
      quizEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function updateProgress(stepId) {
    if (!progressBar) return;

    // Too-early: hide progress bar
    if (stepId === "too-early") {
      progressBar.style.display = "none";
      return;
    }
    progressBar.style.display = "";

    if (state.isVeteran) {
      // Veteran: collapse to 3 dots
      var i;
      for (i = 0; i < dots.length; i++) {
        if (i < 3) {
          dots[i].style.display = "";
        } else {
          dots[i].style.display = "none";
        }
      }
      var vetDotIdx = VET_DOT_MAP[stepId];
      if (vetDotIdx === undefined) vetDotIdx = -1;
      for (i = 0; i < 3; i++) {
        dots[i].classList.remove("progress__dot--active", "progress__dot--completed");
        if (i < vetDotIdx) {
          dots[i].classList.add("progress__dot--completed");
        } else if (i === vetDotIdx) {
          dots[i].classList.add("progress__dot--active");
        }
      }
    } else {
      // New visitor: show all 7 dots
      var newDotIdx = NEW_DOT_MAP[stepId];
      if (newDotIdx === undefined) newDotIdx = 0;
      var j;
      for (j = 0; j < dots.length; j++) {
        dots[j].style.display = "";
        dots[j].classList.remove("progress__dot--active", "progress__dot--completed");
        if (j < newDotIdx) {
          dots[j].classList.add("progress__dot--completed");
        } else if (j === newDotIdx) {
          dots[j].classList.add("progress__dot--active");
        }
      }
    }
  }

  function updateNav(stepId) {
    if (!quizNav) return;

    // Show/hide entire nav bar
    if (HIDE_NAV_STEPS.indexOf(stepId) !== -1) {
      quizNav.style.display = "none";
    } else {
      quizNav.style.display = "";
    }

    // Back button
    if (backBtn) {
      if (HIDE_BACK_STEPS.indexOf(stepId) !== -1) {
        backBtn.style.display = "none";
      } else {
        backBtn.style.display = "";
      }
    }

    // Next button
    if (nextBtn) {
      if (HIDE_NEXT_STEPS.indexOf(stepId) !== -1) {
        nextBtn.style.display = "none";
      } else {
        nextBtn.style.display = "";
        nextBtn.disabled = true; // re-check selection state
        recheckNextEnabled(stepId);
      }
    }
  }

  function recheckNextEnabled(stepId) {
    var stepEl = document.querySelector('[data-step="' + stepId + '"]');
    if (!stepEl || !nextBtn) return;
    var selected = stepEl.querySelectorAll(".option-card--selected");
    nextBtn.disabled = selected.length === 0;
  }

  function getPreviousStep(currentStepId) {
    var path = state.isVeteran ? VET_PATH : NEW_PATH;
    var idx = path.indexOf(currentStepId);
    if (idx > 0) return path[idx - 1];

    // Handle too-early: came from step 3
    if (currentStepId === "too-early") return "3";

    return null;
  }

  function getNextStep(currentStepId) {
    // Special branching from step 3
    if (currentStepId === "3") {
      var bracket = determineBracket();
      if (bracket === "too-early") {
        state.answers.bracket = "too-early";
        return "too-early";
      }
      // Otherwise continue to step 4
      return "4";
    }

    // Step 5: run determineBracket before going to email
    if (currentStepId === "5") {
      state.answers.bracket = determineBracket();
      return "6";
    }

    var path = state.isVeteran ? VET_PATH : NEW_PATH;
    var idx = path.indexOf(currentStepId);
    if (idx !== -1 && idx < path.length - 1) return path[idx + 1];

    return null;
  }

  // ═══════════════════════════════════════════════
  // Bracket Determination
  // ═══════════════════════════════════════════════

  function determineBracket() {
    var skill = state.answers.skill;
    var exp = state.answers.experience;
    if (!skill || !exp) return null;
    var row = BRACKET_MATRIX[skill];
    if (!row) return null;
    return row[exp] || null;
  }

  // ═══════════════════════════════════════════════
  // Option Card Interactions
  // ═══════════════════════════════════════════════

  function initCardListeners() {
    // Delegate clicks on all option cards
    document.addEventListener("click", function (e) {
      var card = e.target.closest(".option-card");
      if (!card) return;

      var stepEl = card.closest(".step");
      if (!stepEl) return;
      var stepId = stepEl.getAttribute("data-step");
      var value = card.getAttribute("data-value");

      // Step 1: auto-advance on click
      if (stepId === "1") {
        handleStep1(value);
        return;
      }

      // Veteran bracket step: auto-advance on click
      if (stepId === "vet-a") {
        handleVetA(value);
        return;
      }

      // Multi-select (step 4)
      var grid = card.closest("[data-max]");
      if (grid) {
        handleMultiSelect(card, grid, stepId);
        return;
      }

      // Single-select for all other steps
      handleSingleSelect(card, stepEl, stepId, value);
    });
  }

  function handleStep1(value) {
    if (value === "veteran") {
      state.isVeteran = true;
      goToStep("vet-a");
    } else {
      state.isVeteran = false;
      goToStep("2");
    }
  }

  function handleVetA(value) {
    state.answers.bracket = value;
    // Highlight the card briefly
    var stepEl = document.querySelector('[data-step="vet-a"]');
    var cards = stepEl.querySelectorAll(".option-card");
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.remove("option-card--selected");
    }
    var clicked = stepEl.querySelector('[data-value="' + value + '"]');
    if (clicked) clicked.classList.add("option-card--selected");
    goToStep("vet-b");
  }

  function handleSingleSelect(card, stepEl, stepId, value) {
    // Deselect siblings
    var siblings = stepEl.querySelectorAll(".option-card");
    for (var i = 0; i < siblings.length; i++) {
      siblings[i].classList.remove("option-card--selected");
    }
    // Select clicked
    card.classList.add("option-card--selected");

    // Store answer
    storeAnswer(stepId, value);

    // Enable next button
    if (nextBtn) nextBtn.disabled = false;
  }

  function handleMultiSelect(card, grid, stepId) {
    var max = parseInt(grid.getAttribute("data-max"), 10) || 2;
    var isSelected = card.classList.contains("option-card--selected");

    if (isSelected) {
      // Deselect
      card.classList.remove("option-card--selected");
    } else {
      // Check if at max
      var currentSelected = grid.querySelectorAll(".option-card--selected");
      if (currentSelected.length >= max) return; // do nothing
      card.classList.add("option-card--selected");
    }

    // Update motivations array
    var selected = grid.querySelectorAll(".option-card--selected");
    var values = [];
    for (var i = 0; i < selected.length; i++) {
      values.push(selected[i].getAttribute("data-value"));
    }
    state.answers.motivations = values;

    // Enable/disable next
    if (nextBtn) nextBtn.disabled = values.length === 0;
  }

  function storeAnswer(stepId, value) {
    switch (stepId) {
      case "2":
        state.answers.experience = value;
        break;
      case "3":
        state.answers.skill = value;
        break;
      case "5":
        state.answers.location = value;
        break;
    }
  }

  // ═══════════════════════════════════════════════
  // Navigation Button Handlers
  // ═══════════════════════════════════════════════

  function initNavButtons() {
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        var prev = getPreviousStep(state.currentStep);
        if (prev) goToStep(prev);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        var next = getNextStep(state.currentStep);
        if (next) goToStep(next);
      });
    }
  }

  // ═══════════════════════════════════════════════
  // Form Handling
  // ═══════════════════════════════════════════════

  function initForms() {
    // Quiz email form (step 6)
    if (quizEmailForm) {
      quizEmailForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var nameInput = quizEmailForm.querySelector('[name="name"]');
        var emailInput = quizEmailForm.querySelector('[name="email"]');
        state.answers.name = nameInput ? nameInput.value.trim() : null;
        state.answers.email = emailInput ? emailInput.value.trim() : null;
        submitLead();
        renderResults();
        goToStep("7");
      });
    }

    // Veteran email form (vet-b)
    if (vetEmailForm) {
      vetEmailForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var nameInput = vetEmailForm.querySelector('[name="name"]');
        var emailInput = vetEmailForm.querySelector('[name="email"]');
        state.answers.name = nameInput ? nameInput.value.trim() : null;
        state.answers.email = emailInput ? emailInput.value.trim() : null;
        submitLead();
        renderResults();
        goToStep("7");
      });
    }

    // Early email form (too-early)
    if (earlyEmailForm) {
      earlyEmailForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var nameInput = earlyEmailForm.querySelector('[name="name"]');
        var emailInput = earlyEmailForm.querySelector('[name="email"]');
        state.answers.name = nameInput ? nameInput.value.trim() : null;
        state.answers.email = emailInput ? emailInput.value.trim() : null;
        state.answers.bracket = "too-early";
        submitLead();
        // Replace form with thank-you message
        var thankYou = document.createElement("p");
        thankYou.className = "step__subtitle";
        thankYou.style.marginTop = "1.5rem";
        thankYou.style.fontWeight = "600";
        thankYou.textContent = "Thanks! We\u2019ll be in touch.";
        earlyEmailForm.parentNode.insertBefore(thankYou, earlyEmailForm.nextSibling);
        earlyEmailForm.style.display = "none";
      });
    }

    // Vet skip button
    if (vetSkipBtn) {
      vetSkipBtn.addEventListener("click", function () {
        renderResults();
        goToStep("7");
      });
    }
  }

  // ═══════════════════════════════════════════════
  // Lead Submission
  // ═══════════════════════════════════════════════

  function submitLead() {
    var payload = {
      name: state.answers.name,
      email: state.answers.email,
      bracket: state.answers.bracket,
      experience: state.answers.experience,
      skillLevel: state.answers.skill,
      motivations: state.answers.motivations,
      locationPref: state.answers.location,
      isVeteran: state.isVeteran,
      source: "tournament-funnel",
      completedSteps: state.completedSteps,
    };

    fetch("https://play.linkanddink.com/api/tournament-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(function () {
      // Graceful degradation — show results anyway
      // Store in localStorage as backup
      try {
        localStorage.setItem("tournament_lead_backup", JSON.stringify(payload));
      } catch (e) {
        /* ignore */
      }
    });
  }

  // ═══════════════════════════════════════════════
  // Results Rendering (Step 7)
  // ═══════════════════════════════════════════════

  function renderResults() {
    if (!resultsContainer) return;

    // Clear previous results
    while (resultsContainer.firstChild) {
      resultsContainer.removeChild(resultsContainer.firstChild);
    }

    var bracket = state.answers.bracket;

    // Heading
    var heading = document.createElement("h2");
    heading.className = "results__heading";
    heading.textContent = "Your Results";
    resultsContainer.appendChild(heading);

    // Intro
    var intro = document.createElement("p");
    intro.className = "results__intro";
    intro.textContent = state.isVeteran
      ? "Welcome back! Here are your recommended events."
      : "Based on your answers, here\u2019s where we think you\u2019ll fit best.";
    resultsContainer.appendChild(intro);

    // 1. Bracket card
    renderBracketCard(bracket);

    // 2. Events card (fetched async, but render placeholder first)
    var eventsCard = createResultCard("events", "Recommended Events", "Loading events\u2026");
    resultsContainer.appendChild(eventsCard);
    fetchAndRenderEvents(eventsCard, bracket);

    // 3. Partner card
    renderPartnerCard();

    // 4. Social fit card (skip for veterans)
    if (!state.isVeteran) {
      renderSocialCard();
    }

    // 5. Community card
    renderCommunityCard();
  }

  function createResultCard(variant, title, bodyText) {
    var card = document.createElement("div");
    card.className = "result-card result-card--" + variant;

    var titleEl = document.createElement("div");
    titleEl.className = "result-card__title";
    titleEl.textContent = title;
    card.appendChild(titleEl);

    var body = document.createElement("div");
    body.className = "result-card__body";
    body.textContent = bodyText;
    card.appendChild(body);

    return card;
  }

  function renderBracketCard(bracket) {
    var displayBracket = bracket ? bracket.replace("-", "\u2013") : "";
    var card = createResultCard(
      "bracket",
      "Your Bracket: " + displayBracket,
      getBracketExplanation(bracket)
    );
    resultsContainer.appendChild(card);
  }

  function getBracketExplanation(bracket) {
    if (state.isVeteran) {
      return "As a returning player, you selected the " + bracket.replace("-", "\u2013") + " bracket.";
    }

    var skill = state.answers.skill;
    var exp = state.answers.experience;
    var explanations = {
      "3.0-3.5": "You\u2019re building a strong foundation. The 3.0\u20133.5 bracket is a great place to gain competitive experience.",
      "3.5-4.0": "You\u2019ve got solid skills and strategy. The 3.5\u20134.0 bracket will challenge you against strong competition.",
      "4.0-4.5": "You\u2019re an advanced player. The 4.0\u20134.5 bracket features the highest level of play in our series.",
    };

    return explanations[bracket] || "We\u2019ve found the right bracket for your skill level.";
  }

  function renderPartnerCard() {
    var card = document.createElement("div");
    card.className = "result-card result-card--partner";

    var title = document.createElement("div");
    title.className = "result-card__title";
    title.textContent = "Need a Partner?";
    card.appendChild(title);

    var body = document.createElement("div");
    body.className = "result-card__body";

    var text = document.createElement("p");
    text.textContent = "Don\u2019t have a doubles partner? We can help match you with someone at your level.";
    body.appendChild(text);

    var link = document.createElement("a");
    link.href = "https://play.linkanddink.com";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "btn btn--secondary btn--small";
    link.style.marginTop = "0.75rem";
    link.style.display = "inline-block";
    link.textContent = "Find a Partner";
    body.appendChild(link);

    card.appendChild(body);
    resultsContainer.appendChild(card);
  }

  function renderSocialCard() {
    var motivations = state.answers.motivations || [];
    var hasSocial = motivations.indexOf("social") !== -1;
    var hasCommunity = motivations.indexOf("community") !== -1;

    // Only show if there are motivations to match against
    if (motivations.length === 0) return;

    var card = document.createElement("div");
    card.className = "result-card result-card--social";

    var title = document.createElement("div");
    title.className = "result-card__title";
    title.textContent = "Also For You";
    card.appendChild(title);

    var body = document.createElement("div");
    body.className = "result-card__body";
    body.setAttribute("id", "social-events-body");
    body.textContent = "Checking for specialty events\u2026";
    card.appendChild(body);

    resultsContainer.appendChild(card);

    // Populate social events once we have event data
    fetchSocialEvents(body, hasSocial, hasCommunity);
  }

  function renderCommunityCard() {
    var card = document.createElement("div");
    card.className = "result-card result-card--community";

    var title = document.createElement("div");
    title.className = "result-card__title";
    title.textContent = "Join the Community";
    card.appendChild(title);

    var body = document.createElement("div");
    body.className = "result-card__body";

    var text = document.createElement("p");
    text.textContent = "Connect with other players, get event updates, and become part of the Link & Dink community.";
    body.appendChild(text);

    var linkWrap = document.createElement("div");
    linkWrap.style.marginTop = "0.75rem";
    linkWrap.style.display = "flex";
    linkWrap.style.gap = "0.75rem";
    linkWrap.style.flexWrap = "wrap";

    var hubLink = document.createElement("a");
    hubLink.href = "https://play.linkanddink.com";
    hubLink.target = "_blank";
    hubLink.rel = "noopener noreferrer";
    hubLink.className = "btn btn--primary btn--small";
    hubLink.textContent = "The Hub";
    linkWrap.appendChild(hubLink);

    var guideLink = document.createElement("a");
    guideLink.href = "player-guide.html";
    guideLink.className = "btn btn--secondary btn--small";
    guideLink.textContent = "Player Guide";
    linkWrap.appendChild(guideLink);

    body.appendChild(linkWrap);
    card.appendChild(body);
    resultsContainer.appendChild(card);
  }

  // ═══════════════════════════════════════════════
  // Event Fetching & Filtering
  // ═══════════════════════════════════════════════

  var cachedEventData = null;

  function fetchEventData(callback) {
    if (cachedEventData) {
      callback(cachedEventData);
      return;
    }
    fetch("/api/events")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to fetch events");
        return res.json();
      })
      .then(function (data) {
        cachedEventData = data;
        callback(data);
      })
      .catch(function () {
        callback(null);
      });
  }

  function filterEvents(locations, bracket, locationPref) {
    var bracketRegex = new RegExp(
      bracket.replace(/\./g, "\\.").replace("-", "\\s*[-\\u2013]\\s*")
    );
    var filtered = [];
    locations.forEach(function (loc) {
      if (locationPref && locationPref !== "either" && loc.location !== locationPref) return;
      loc.events.forEach(function (ev) {
        if (bracketRegex.test(ev.name)) {
          filtered.push({
            eventId: ev.eventId,
            name: ev.name,
            startDateTime: ev.startDateTime,
            endDateTime: ev.endDateTime,
            registrationUrl: ev.registrationUrl,
            location: loc.location,
            locationLabel: loc.label,
            isFull: ev.isFull,
            registeredCount: ev.registeredCount,
            maxRegistrants: ev.maxRegistrants,
          });
        }
      });
    });
    return filtered;
  }

  function fetchAndRenderEvents(eventsCard, bracket) {
    var body = eventsCard.querySelector(".result-card__body");

    fetchEventData(function (data) {
      // Clear loading text
      while (body.firstChild) body.removeChild(body.firstChild);

      if (!data || !data.locations || !bracket) {
        body.textContent = "Events for your bracket are coming soon. We\u2019ll email you when registration opens!";
        return;
      }

      var locationPref = state.answers.location;
      var events = filterEvents(data.locations, bracket, locationPref);

      if (events.length === 0) {
        body.textContent = "Events for your bracket are coming soon. We\u2019ll email you when registration opens!";
        return;
      }

      // Show up to 3 events
      var toShow = events.slice(0, 3);
      var list = document.createElement("div");
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "0.75rem";

      toShow.forEach(function (ev) {
        var item = document.createElement("div");
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        item.style.gap = "0.75rem";
        item.style.flexWrap = "wrap";

        var info = document.createElement("div");

        var dt = new Date(ev.startDateTime);
        var dateStr = dt.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });

        var dateLine = document.createElement("div");
        dateLine.style.fontSize = "0.8rem";
        dateLine.style.opacity = "0.7";
        dateLine.textContent = dateStr + " \u2022 " + ev.locationLabel;
        info.appendChild(dateLine);

        var nameLine = document.createElement("div");
        nameLine.style.fontWeight = "600";
        nameLine.textContent = ev.name;
        info.appendChild(nameLine);

        item.appendChild(info);

        if (ev.isFull) {
          var fullBadge = document.createElement("span");
          fullBadge.className = "btn--disabled";
          fullBadge.textContent = "Full";
          item.appendChild(fullBadge);
        } else {
          var regLink = document.createElement("a");
          regLink.href = ev.registrationUrl;
          regLink.target = "_blank";
          regLink.rel = "noopener noreferrer";
          regLink.className = "btn btn--primary btn--small";
          regLink.textContent = "Register";
          item.appendChild(regLink);
        }

        list.appendChild(item);
      });

      body.appendChild(list);

      if (events.length > 3) {
        var more = document.createElement("p");
        more.style.fontSize = "0.85rem";
        more.style.opacity = "0.6";
        more.style.marginTop = "0.5rem";
        more.textContent = "+" + (events.length - 3) + " more events available";
        body.appendChild(more);
      }
    });
  }

  function fetchSocialEvents(bodyEl, hasSocial, hasCommunity) {
    fetchEventData(function (data) {
      while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);

      if (!data || !data.locations) {
        bodyEl.textContent = "Check back soon for specialty events!";
        return;
      }

      var socialEvents = [];
      var locationPref = state.answers.location;

      data.locations.forEach(function (loc) {
        if (locationPref && locationPref !== "either" && loc.location !== locationPref) return;
        loc.events.forEach(function (ev) {
          var nameLower = ev.name.toLowerCase();
          var include = false;

          // Women's events: show if social or community motivation
          if (nameLower.indexOf("women") !== -1 && (hasSocial || hasCommunity)) {
            include = true;
          }
          // Mixed events: show if social
          if (nameLower.indexOf("mixed") !== -1 && hasSocial) {
            include = true;
          }
          // Senior/50+ events: show for all
          if (nameLower.indexOf("senior") !== -1 || nameLower.indexOf("50+") !== -1) {
            include = true;
          }
          // Junior/14 events: show for all
          if (nameLower.indexOf("junior") !== -1 || nameLower.indexOf("14") !== -1) {
            include = true;
          }

          if (include) {
            socialEvents.push({
              name: ev.name,
              startDateTime: ev.startDateTime,
              registrationUrl: ev.registrationUrl,
              locationLabel: loc.label,
              isFull: ev.isFull,
            });
          }
        });
      });

      if (socialEvents.length === 0) {
        // Remove the whole card if no social events match
        var cardEl = bodyEl.closest(".result-card");
        if (cardEl && cardEl.parentNode) {
          cardEl.parentNode.removeChild(cardEl);
        }
        return;
      }

      var intro = document.createElement("p");
      intro.textContent = "Based on what matters to you, these specialty events might be a great fit:";
      intro.style.marginBottom = "0.75rem";
      bodyEl.appendChild(intro);

      socialEvents.forEach(function (ev) {
        var item = document.createElement("div");
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        item.style.gap = "0.75rem";
        item.style.flexWrap = "wrap";
        item.style.marginBottom = "0.5rem";

        var info = document.createElement("div");

        var dt = new Date(ev.startDateTime);
        var dateStr = dt.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });

        var dateLine = document.createElement("div");
        dateLine.style.fontSize = "0.8rem";
        dateLine.style.opacity = "0.7";
        dateLine.textContent = dateStr + " \u2022 " + ev.locationLabel;
        info.appendChild(dateLine);

        var nameLine = document.createElement("div");
        nameLine.style.fontWeight = "600";
        nameLine.textContent = ev.name;
        info.appendChild(nameLine);

        item.appendChild(info);

        if (!ev.isFull) {
          var regLink = document.createElement("a");
          regLink.href = ev.registrationUrl;
          regLink.target = "_blank";
          regLink.rel = "noopener noreferrer";
          regLink.className = "btn btn--secondary btn--small";
          regLink.textContent = "Details";
          item.appendChild(regLink);
        }

        bodyEl.appendChild(item);
      });
    });
  }

  // ═══════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════

  function init() {
    initCardListeners();
    initNavButtons();
    initForms();

    // Set initial state: step 1, nav hidden
    updateNav("1");
    updateProgress("1");
  }

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
