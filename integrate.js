/*
 * Copyright 2020 Jiří Janoušek <janousek.jiri@gmail.com>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

(function (Nuvola) {
  const _ = Nuvola.Translate.gettext
  const ADDRESS = 'app.address'
  const ADDRESS_DEFAULT = 'http://localhost:8096/'

  // Create media player component
  const player = Nuvola.$object(Nuvola.MediaPlayer)

  // Handy aliases
  const PlaybackState = Nuvola.PlaybackState
  const PlayerAction = Nuvola.PlayerAction

  // Create new WebApp prototype
  const WebApp = Nuvola.$WebApp()

  WebApp._onInitAppRunner = function (emitter) {
    Nuvola.WebApp._onInitAppRunner.call(this, emitter)
    Nuvola.config.setDefault(ADDRESS, ADDRESS_DEFAULT)
    Nuvola.core.connect('InitializationForm', this)
    Nuvola.core.connect('PreferencesForm', this)
  }

  WebApp._onPreferencesForm = function (emitter, values, entries) {
    this.appendPreferences(values, entries)
  }

  WebApp._onInitializationForm = function (emitter, values, entries) {
    if (!Nuvola.config.hasKey(ADDRESS)) {
      this.appendPreferences(values, entries)
    }
  }

  WebApp._onHomePageRequest = function (emitter, result) {
    result.url = Nuvola.config.get(ADDRESS) || ADDRESS_DEFAULT
  }

  WebApp.appendPreferences = function (values, entries) {
    values[ADDRESS] = Nuvola.config.get(ADDRESS)
    entries.push(['header', 'Emby'])
    entries.push(['label', _('Address of your Emby Server')])
    entries.push(['string', ADDRESS, _('Address')])
  }

  // Initialization routines
  WebApp._onInitWebWorker = function (emitter) {
    Nuvola.WebApp._onInitWebWorker.call(this, emitter)

    const state = document.readyState
    if (state === 'interactive' || state === 'complete') {
      this._onPageReady()
    } else {
      document.addEventListener('DOMContentLoaded', this._onPageReady.bind(this))
    }
  }

  // Page is ready for magic
  WebApp._onPageReady = function () {
    // Connect handler for signal ActionActivated
    Nuvola.actions.connect('ActionActivated', this)

    // Start update routine
    this.update()
  }

  // Extract data from the web page
  WebApp.update = function () {
    const elms = this._getElements()
    const time = this._getTime()

    const track = {
      title: Nuvola.queryText('.nowPlayingBarText button[data-type="MusicAlbum"]'),
      artist: Nuvola.queryText('.nowPlayingBarText button[data-type="MusicArtist"]'),
      album: null,
      artLocation: null,
      length: time[1],
      rating: null
    }

    const cover = document.querySelector('.nowPlayingImage')
    if (cover) {
      let url = cover.style.backgroundImage.replace(/height=\d+/, 'height=400')
      url = url.substring(5, url.length - 2) // url("...")
      if (url) {
        track.artLocation = url
      }
    }

    let state
    if (elms.pause) {
      state = PlaybackState.PLAYING
    } else if (elms.play) {
      state = PlaybackState.PAUSED
    } else {
      state = PlaybackState.UNKNOWN
    }

    player.setPlaybackState(state)
    player.setTrack(track)

    player.setCanGoPrev(!!elms.prev)
    player.setCanGoNext(!!elms.next)
    player.setCanPlay(!!elms.play)
    player.setCanPause(!!elms.pause)

    player.setCanSeek(state !== PlaybackState.UNKNOWN && elms.progressbar)
    player.setTrackPosition(time[0])

    let volume = null
    if (elms.volumemark && elms.volumemark.style.width) {
      volume = elms.volumemark.style.width.replace('%', '') / 100
    }
    player.updateVolume(volume)
    player.setCanChangeVolume(!!elms.volumebar)

    const repeat = this._getRepeat(elms)
    player.setCanRepeat(repeat !== null)
    player.setRepeatState(repeat)

    // Schedule the next update
    setTimeout(this.update.bind(this), 500)
  }

  // Handler of playback actions
  WebApp._onActionActivated = function (emitter, name, param) {
    const elms = this._getElements()
    switch (name) {
      case PlayerAction.TOGGLE_PLAY:
        if (elms.play) {
          Nuvola.clickOnElement(elms.play)
        } else {
          Nuvola.clickOnElement(elms.pause)
        }
        break
      case PlayerAction.PLAY:
        Nuvola.clickOnElement(elms.play)
        break
      case PlayerAction.PAUSE:
      case PlayerAction.STOP:
        Nuvola.clickOnElement(elms.pause)
        break
      case PlayerAction.PREV_SONG:
        Nuvola.clickOnElement(elms.prev)
        break
      case PlayerAction.NEXT_SONG:
        Nuvola.clickOnElement(elms.next)
        break
      case PlayerAction.SEEK: {
        const total = this._getTime()[1]
        if (total && param > 0 && param <= total) {
          Nuvola.setInputValueWithEvent(elms.progressbar, 100 * param / total)
        }
        break
      }
      case PlayerAction.CHANGE_VOLUME:
        Nuvola.setInputValueWithEvent(elms.volumebar, 100 * param)
        break
      case PlayerAction.REPEAT:
        this._setRepeat(elms, param)
        break
    }
  }

  WebApp._getElements = function () {
  // Interesting elements
    const elms = {
      play: document.querySelector('.nowPlayingBar button.playPauseButton'),
      pause: null,
      next: document.querySelector('.nowPlayingBar button.nextTrackButton'),
      prev: document.querySelector('.nowPlayingBar button.previousTrackButton'),
      repeat: document.querySelector('.nowPlayingBar button.toggleRepeatButton'),
      progressbar: document.querySelector('.nowPlayingBarPositionSlider'),
      volumebar: document.querySelector('.videoOsdVolumeSlider'),
      volumemark: document.querySelector('.videoOsdVolumeSliderWrapper .emby-slider-background-lower')
    }

    // Ignore disabled buttons
    for (const key in elms) {
      if (elms[key] && elms[key].disabled) {
        elms[key] = null
      }
    }

    // Distinguish between play and pause action
    if (elms.play && elms.play.firstChild && elms.play.firstChild.textContent === 'pause') {
      elms.pause = elms.play
      elms.play = null
    }
    return elms
  }

  WebApp._getTime = function () {
    const time = Nuvola.queryText('.nowPlayingBarCurrentTime')
    if (time && time.includes('/')) {
      return time.split('/').map(Nuvola.parseTimeUsec)
    }
    return [null, null]
  }

  WebApp._getRepeat = function (elms) {
    const elm = elms.repeat
    if (!elm) {
      return null
    }
    if (elm.firstChild && elm.firstChild.textContent === 'repeat_one') {
      return Nuvola.PlayerRepeat.TRACK
    }
    return elm.classList.contains('repeatButton-active') ? Nuvola.PlayerRepeat.PLAYLIST : Nuvola.PlayerRepeat.NONE
  }

  WebApp._setRepeat = function (elms, repeat) {
    while (this._getRepeat(elms) !== repeat) {
      Nuvola.clickOnElement(elms.repeat)
    }
  }

  WebApp.start()
})(this) // function(Nuvola)
