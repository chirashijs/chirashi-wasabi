import raf from 'raf'

import forEach from 'chirashi/src/core/for-each'
import forElements from 'chirashi/src/core/for-elements'

import remove from 'chirashi/src/dom/remove'
import data from 'chirashi/src/dom/data'
import find from 'chirashi/src/dom/find'
import createElement from 'chirashi/src/dom/create-element'
import append from 'chirashi/src/dom/append'
import clone from 'chirashi/src/dom/clone'

import style from 'chirashi/src/styles/style'
import getOffset from 'chirashi/src/styles/offset'
import height from 'chirashi/src/styles/height'
import transform from 'chirashi/src/styles/transform'
import size from 'chirashi/src/styles/size'

import resize from 'chirashi/src/events/resize'
import unresize from 'chirashi/src/events/unresize'
import scroll from 'chirashi/src/events/scroll'
import unscroll from 'chirashi/src/events/unscroll'

import defaultify from 'chirashi/src/utils/defaultify'

let defaults = {
    debug: false,
    offset: 0,
    ease: 0.2,
    stepMinSize: 5,
    snapOffset: 0,
    handle: {
        top: 'top',
        bottom: 'bottom'
    },
    parallaxEase: 0.8
}

function randomColor () {
    return '#' + Math.floor(Math.random()*16777215).toString(16)
}

//Scroll manager
export default class Wasabi {
    constructor(config) {
        this.config = defaultify(config, defaults)

        this.wrapper = this.scroller ? this.scroller.wrapper : document.body

        if (!this.config.scroller) {
            this.wrapper = document.body
            this.scrollTop = this.previousScrollTop = getOffset(this.wrapper).top

            this.scrollEventsCallback = scroll(this.onScrollEvent.bind(this))

            this.resizeCallback = resize(this.refreshCallback.bind(this))
        }
        else {
            this.scroller = this.config.scroller

            this.wrapper = this.scroller.element
            this.scrollTop = this.previousScrollTop = this.scroller.scroll.y

            this.scrollerCallback = this.onScroller.bind(this)
            this.scroller.on('update', this.scrollerCallback)

            this.resizeCallback = this.refreshCallback.bind(this)
            this.scroller.on('resize', this.resizeCallback)
        }

        if (this.config.debug) {
            this.debugWrapper = createElement('<div id="wasabi-debug"></div>')
            style(this.debugWrapper, {
                'z-index': 10000,
                width: 25,
                height: height(this.wrapper),
                position: 'absolute',
                top: 0,
                right: 0,
                background: '#2d2d2d'
            })
            append(this.wrapper, this.debugWrapper)
        }

        this.currentSnapIndex = 0
        this.running = true
        this.refresh()
        this.update()
    }

    refreshCallback() {
        if (this.killed) return

        clearTimeout(this.refreshTimeout)
        this.refreshTimeout = setTimeout(this.refresh.bind(this), 200)
    }

    refresh() {
        if (this.config.debug) console.log('%c WASABI DEBUG ', 'background: #2d2d2d color: #b0dd44')

        this.zones = []
        this.snaps = []

        this.windowHeight = window.innerHeight
        this.halfHeight = this.windowHeight/2

        this.wrapperTop = getOffset(this.wrapper).top

        if (this.config.debug) remove('#wasabi-debug .wasabi-marker')

        if (typeof this.config.zones == 'string') {
            forElements(this.config.zones, (element) => {
                this.addZone({}, element)
            })
        }
        else {
            let i = this.config.zones.length
            while (i--) {
                let zoneConfig = this.config.zones[i]

                if (zoneConfig.selector) {
                    forElements(zoneConfig.selector, (element) => {
                        this.addZone(zoneConfig, element)
                    })
                }
                else if (zoneConfig.elements) {
                    forElements(zoneConfig.elements, (element) => {
                        this.addZone(zoneConfig, element)
                    })
                }
                else {
                    this.addZone(zoneConfig)
                }
            }
        }

        if (this.snaps.length) {
            if (!this.scroller) {
                console.error('snap option needs a SmoothScroller instance')
            }

            this.snaps.sort((a, b) => {
                return a.top - b.top
            })

            this.currentSnap = this.snaps[this.currentSnapIndex]
        }
    }

    addZone(zoneConfig, element) {
        let zone = {},
        top, bottom

        if (element) {
            zone.element = element
            zone.selector = zoneConfig.selector
            top = getOffset(element).top + this.scrollTop
            bottom = top + height(element)

            if (zoneConfig.parallax) {
                zone.parallax = []
                forEach(find(element, zoneConfig.parallax), (pxElement) => {
                    let options = eval('('+data(pxElement,'wasabi')+')')

                    let toX = (typeof options.x !== 'undefined') ? options.x : ((options.to && options.to.x) || 0),
                    toY = (typeof options.y !== 'undefined') ? options.y : ((options.to && options.to.y) || 0),
                    fromX = (options.from && options.from.x) || 0,
                    fromY = (options.from && options.from.y) || 0,
                    parentSize = size(element.parentNode)

                    if (typeof toX == 'string' && toX.indexOf('%') != -1)
                    toX = parseInt(toX, 10) * parentSize.width

                    if (typeof toY == 'string' && toY.indexOf('%') != -1)
                    toY = parseInt(toY, 10) * parentSize.height

                    if (typeof fromX == 'string' && fromX.indexOf('%') != -1)
                    fromX = parseInt(fromX, 10) * parentSize.width

                    if (typeof fromY == 'string' && fromY.indexOf('%') != -1)
                    fromY = parseInt(fromY, 10) * parentSize.height

                    zone.parallax.push({
                        element: pxElement,
                        toX: toX,
                        toY: toY,
                        fromX: fromX,
                        fromY: fromY,
                        transform: {
                            x: 0,
                            y: 0
                        },
                        targetTransform: {
                            x: 0,
                            y: 0
                        }
                    })
                })
            }
        }
        else {
            top = zoneConfig.top
            bottom = zoneConfig.bottom
        }

        let offset = defaultify(zoneConfig.offset, this.config.offset)
        zone.offset = {
            top: defaultify(offset.top, offset),
            bottom: defaultify(offset.bottom, offset)
        }

        zone.top = top - zone.offset.top
        zone.bottom = bottom + zone.offset.bottom

        if (this.config.debug) {
            let color = randomColor()

            console.log(zone.selector +' %c ' + color, 'color:'+color)
            console.log(zone.element)

            let topDebug = createElement(`<div class="wasabi-marker"></div>`)
            append(this.debugWrapper, topDebug)
            style(topDebug, {
                position: 'absolute',
                top: zone.top,
                right: 0,
                width: 25,
                height: 2,
                background: color
            })

            let bottomDebug = clone(topDebug)
            append(this.debugWrapper, bottomDebug)
            style(bottomDebug, {
                'z-index': 9999,
                position: 'absolute',
                top: zone.bottom,
                right: 0,
                width: 25,
                height: 2,
                background: color
            })
        }

        zone.size = zone.bottom - zone.top
        zone.handle = zoneConfig.handle || this.config.handle
        zone.progress = zoneConfig.progress || this.config.progress
        zone.snap = zoneConfig.snap || this.config.snap
        zone.handler = zoneConfig.handler || this.config.handler
        zone.enter = zoneConfig.enter || this.config.enter
        zone.leave = zoneConfig.leave || this.config.leave

        if (zoneConfig.tween) {
            zone.tween = zoneConfig.tween
            if (zone.tween.pause) zone.tween.pause()
        }

        if (zoneConfig.progressTween) {
            zone.progressTween = zoneConfig.progressTween
            if (zone.progressTween.pause) zone.progressTween.pause()
        }

        let handles = {}
        let handleForward = zone.handle.forward || zone.handle
        handles.forward = {
            top: handleForward.top || handleForward,
            bottom: handleForward.bottom || handleForward
        }
        let handleBackward = zone.handle.forward || zone.handle
        handles.backward = {
            top: handleBackward.top || handleBackward,
            bottom: handleBackward.bottom || handleBackward
        }

        if (handles.forward.top == 'middle') {
            zone.forwardTop = zone.top - this.halfHeight
        }
        else if (handles.forward.top == 'bottom') {
            zone.forwardTop = zone.top - this.windowHeight
        }
        else {
            zone.forwardTop = zone.top
        }

        if (handles.forward.bottom == 'middle') {
            zone.forwardBottom = zone.bottom - this.halfHeight
        }
        else if (handles.forward.bottom == 'bottom') {
            zone.forwardBottom = zone.bottom - this.windowHeight
        }
        else {
            zone.forwardBottom = zone.bottom
        }

        zone.forwardSize = Math.max(this.config.stepMinSize, zone.forwardBottom - zone.forwardTop)

        if (handles.backward.top == 'middle') {
            zone.backwardTop = zone.top - this.halfHeight
        }
        else if (handles.backward.top == 'bottom') {
            zone.backwardTop = zone.top - this.windowHeight
        }
        else {
            zone.backwardTop = zone.top
        }

        if (handles.backward.bottom == 'middle') {
            zone.backwardBottom = zone.bottom - this.halfHeight
        }
        else if (handles.backward.bottom == 'bottom') {
            zone.backwardBottom = zone.bottom - this.windowHeight
        }
        else {
            zone.backwardBottom = zone.bottom
        }

        zone.backwardSize = Math.max(this.config.stepMinSize, zone.backwardBottom - zone.backwardTop)

        if (zone.snap) this.snaps.push(zone)

        this.zones.push(zone)
    }

    testSnapping(scrollTarget) {
        if (!this.scroller.scrollEnabled || !this.snaps.length) return

        let previous = this.snaps[this.currentSnapIndex-1],
        next = this.snaps[this.currentSnapIndex+1]

        if (previous && scrollTarget.y < this.currentSnap.top) {
            --this.currentSnapIndex
            this.currentSnap = previous

            this.scroller.scrollTo({
                x: 0,
                y: (previous.bottom - this.currentSnap.offset.bottom) - Math.min(previous.size, this.windowHeight)-1
            })
        }
        else if (next && scrollTarget.y > this.currentSnap.bottom - this.windowHeight) {
            ++this.currentSnapIndex
            this.currentSnap = next

            this.scroller.scrollTo({
                x: 0,
                y: (next.top + this.currentSnap.offset.top)+1
            })
        }
    }

    onScroller(scrollTarget) {
        if (this.killed) return

        this.scrollTop = this.scroller.scroll.y
        this.testSnapping(scrollTarget)
        this.update()
    }

    onScrollEvent(event) {
        if (this.killed) return

        this.scrollTop = (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0) - this.wrapperTop
        this.update()
    }

    update() {
        if (this.killed) return

        let i = this.zones.length,
            direction = this.previousScrollTop < this.scrollTop ? 'forward' : 'backward',
            updateParallax = false

        while (i--) {
            let zone = this.zones[i], entered, progress

            progress = (this.scrollTop - zone[direction+'Top'])/zone[direction+'Size']
            entered = progress >= 0 && progress <= 1

            if (!zone.entered && entered) {
                if (zone.tween) zone.tween.resume()
                if(zone.handler) zone.handler('enter', direction, zone.selector, zone.element)
                if(zone.enter) zone.enter(direction, zone.selector, zone.element)

                if(zone.snap) {
                    this.currentSnapIndex = this.snaps.indexOf(zone)
                    this.currentSnap = this.snaps[this.currentSnapIndex]
                }
            }
            else if (zone.entered && !entered) {
                if(zone.handler) zone.handler('leave', direction, zone.selector, zone.element)
                if(zone.leave) zone.leave(direction, zone.selector, zone.element)
            }

            if (zone.parallax) {
                forEach(zone.parallax, (item) => {
                    item.targetTransform = {
                        x: item.fromX + (item.toX - item.fromX) * progress,
                        y: item.fromY + (item.toY - item.fromY) * progress
                    }
                })

                updateParallax = true
            }

            zone.entered = entered
            if (zone.entered) {
                if (zone.progress) zone.progress(direction, progress, zone.selector)
                if (zone.progressTween && zone.progressTween.progress) zone.progressTween.progress(progress)
            }
        }

        this.previousScrollTop = this.scrollTop

        if (updateParallax) this.updateParallaxIfNeeded()
    }

    updateParallaxIfNeeded() {
        if (!this.updatingParallax)
            this.updateParallax()
    }

    updateParallax() {
        if (this.killed) return

        this.updatingParallax = false

        let i = this.zones.length

        while (i--) {
            let zone = this.zones[i]

            if (zone.parallax) {
                forEach(zone.parallax, (item) => {
                    let dx = (item.targetTransform.x - item.transform.x) * this.config.parallaxEase,
                        dy = (item.targetTransform.y - item.transform.y) * this.config.parallaxEase

                    item.transform = {
                        x: item.transform.x + dx,
                        y: item.transform.y + dy
                    }

                    transform(item.element, item.transform)

                    if (!this.updatingParallax)
                        this.updatingParallax = Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1
                })
            }
        }

        if (this.updatingParallax)
            raf(this.updateParallax.bind(this))
    }

    replay() {
        forEach(this.zones, (zone) => {
            if (zone.entered) {
                if (zone.tween) zone.tween.resume()
                if(zone.handler) zone.handler('enter', 'forward', zone.selector, zone.element)
                if(zone.enter) zone.enter('forward', zone.selector, zone.element)
            }
        })
    }

    kill() {
        if (this.killed) return

        this.killed = true

        remove(this.debugWrapper)

        if (this.scrollEventsCallback) {
            unscroll(this.scrollEventsCallback)
            unresize(this.resizeCallback)
        }
        else if (this.scrollerCallback) {
            this.scroller.off('update', this.scrollerCallback)
            this.scroller.off('resize', this.resizeCallback)
        }

        let i = this.zones.length
        while(i--) {
            let zone = this.zones[i]

            if (zone.tween) this.killTimeline(zone.tween)
            if (zone.progressTween) this.killTimeline(zone.progressTween)
        }

        this.zones = this.snaps = null
    }

    concatenateVars(object) {
        if (!object) return

        let keys = Object.keys(object),
        i = keys.length,
        vars = []

        while(i--) {
            if (typeof object[keys[i]] == 'object') {
                vars = vars.concat(this.concatenateVars(object[keys[i]]))
            }
            else {
                let key = keys[i]
                vars.push(key == 'x' || key == 'y' || key == 'scale' || key == 'rotate' ? 'transform' : key)
            }
        }

        return vars
    }

    killTimeline(timeline) {
        let tweens = timeline.getChildren()
        timeline.kill()

        let i = tweens.length, tween
        while(i--) {
            tween = tweens[i]

            if (tween.target) {
                TweenLite.set(tween.target, {
                    clearProps: this.concatenateVars(tween.vars).join(',')
                })
            }
        }
    }
}
