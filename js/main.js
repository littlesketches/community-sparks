// Import dependencies as modules
import 'https://cdn.jsdelivr.net/npm/@theatre/browser-bundles@0.5.0-insiders.88df1ef/dist/core-and-studio.js'    // Studio TheatreJS version
// import 'https://cdn.jsdelivr.net/npm/@theatre/browser-bundles@0.5.0-insiders.88df1ef/dist/core-only.min.js'         // Production TheatreJS
import 'https://unpkg.com/external-svg-loader@latest/svg-loader.min.js'
import 'https://d3js.org/d3.v7.min.js'
import animState from '../anim/state.json' assert {type: 'json'};



//////////////////////////////////////////////
/// I. SETUP ANIMATION CANVAS AND TOOLING  ///
//////////////////////////////////////////////

    const urlParams = new URLSearchParams(window.location.search)
    const helpers = {} 

    const state = {         // Animaiton state object
        animation: {
            sheet: {
                loop: {
                    isPlaying: false
                },
                main: {
                    isPlaying: false
                }
            },

            time:       0
        },
        scene:          null,
        act:            null,
        layout: {
            logo: {

            },
            text: {

            }
        },
        ui: {
            visible:        true
        },
        theatre: {
            studioMode: urlParams.has('debug') ? true : false
        }
    }


    const settings = {      // Settings object
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSvk17b0mBwwntBwFoqu-qha7sfPEAgHmw0p_OQAJDjFUYtIj9wWjxUAAR_SFojdtQcNFDJ8xdrjA3_/pub?gid=0&single=true&output=tsv',
        svgNodeSelection: 'rect, circle, path, g',
        time: {
            duration: {
            }
        },
        dims: {
            height: 1080,
            width: 1080,
            margin: {
                top: 50,
                right: 50,
                bottom: 50,
                left: 50,
            }
        },
        scroll: {
            pixelsPerSecond: 100
        }, 
        ui: {
            type:           urlParams.has('ui') ? urlParams.get('ui') : 'buttons',
        }
    }

    // Instantiate TheatreJS core and studio
    const { core, studio } = Theatre

    if (typeof studio !== 'undefined') { // Initialise studio 
        studio.initialize()                 

        if (!state.theatre.studioMode){
            studio.ui.hide()     // Hide UI if specified
        } else {
            d3.select('main').classed('debug', true)
            document.querySelector('.controls-container').classList.add('hidden')
        }
        window.studio = studio                              // Make available as global

    } 



/////////////////////////////////////////////
/// II. SETUP ANIMATION CANVAS AND TOOLS  ///
/////////////////////////////////////////////

    // 1. Load the external SVG "scene" graphic
    const data = await d3.tsv(settings.url).then(data => {
        // a. Parse data
        data.forEach(d => {
            // d.scene = +d.scene
            d.stage = +d.stage
            d.length = +d.length
            d.defaultLength = +d.defaultLength
            d.start = +d.start
            d.end = +d.end
            d.screenText = +d.screenText === 0 ? null : d.screenText
            d.audioScript = +d.audioScript === 0 ? null : d.audioScript
        })
        return data
    })

    // 2. Parse id
    for (const el of d3.selectAll(settings.svgNodeSelection).nodes().filter(el => el.id.indexOf('_') > 0)) {
        el.id = el.id.slice(0, el.id.indexOf('_'))
    }

    // 3. Extract sheet and scene names from data
    settings.sheets = [...new Set(data.map(d => d.sheets))]
        // Hack to edit one sheet at a time
        settings.sheets = [
            'main',
            'loop'
        ]

    settings.scenes = [...new Set(data.filter( d => d.scene !== '').map(d => d.scene))]



/////////////////////////////////////////
/// III. SETUP THEATREJS ANIMATIONS   ///
/////////////////////////////////////////

    // 4. Program animation script from data
    // a. Setup project in anim and annotationData object
    const anim = window.anim = {
        project: core.getProject('Community Sparks Animation', {
            state: animState
        }),
        sheet:              {},      // TheatreJS animation Sheets
        objBySheet:         {},      // Animatable TheatreJS objects 
        controls:           {},      // Custom methods to control playback
    }

    const annotation =  window.annotation = {
        types:      ['subTitles', 'overlays', 'labels'],    // List of editable text types
        data:       {},                                     // Object to store annotation data by scene 
        byScene:    {}                                      // Object 
    }   


    // For each sheet...
    for(const sheet of settings.sheets){
        // b. Add a dope sheet for 
        anim.sheet[sheet] = anim.project.sheet(`${sheet}`)
        // c. Add objects by sheet
        anim.objBySheet[sheet] = {}
        const sel = document.querySelectorAll(`${sheet !== 'loop' ? '#canvas [animated=true]' : '#canvas .loop'}`)

        for (const el of [...sel].sort( (a, b) => a.id > b.id ? 1 : -1)){
            const id = el.id,
                bbox = el.getBBox()

            // Create the object
            const rgb = el.style.fill.split(',').map(d => +d.replace(/[^0-9]/gi, ''))

            const obj = {
                x:          0,
                y:          0,
                rotate:     core.types.number(0, { range: [-3600, 3600] }),
                scale:      core.types.number(1, { range: [0, 3] }),
                opacity:    core.types.number(1, { range: [0, 1] }), 
            }

            anim.objBySheet[sheet][id] = anim.sheet[sheet].object(id, obj)

            // Add animatable attributes
            anim.objBySheet[sheet][id].onValuesChange((obj) => {
                el.style.transform = `rotate(${obj.rotate}deg) scale(${obj.scale}) translate(${obj.x}px, ${obj.y}px)`
                el.style.opacity = obj.opacity
                el.style.transformOrigin = `${bbox.x +(bbox.width * 0.5)}px ${bbox.y + (bbox.height * 0.5)}px`   
            })
        }

        // For the main animation ..
        const textElIDs = []
        if(sheet === 'main'){
            for(const scene of settings.scenes){

                // d. Extract data text elements for "subTitle", "overlayText" and "label"
                annotation.data[scene] = {
                    subTitles:      data.filter(d => d.scene === scene && d.subTitleID !=='')
                                        .map( d => {
                                            return {
                                                id:          d.subTitleID,
                                                text:        d.subTitleText,
                                                x:          0,
                                                y:          0,
                                                width:      +d.subTitleWidth === 0 ? null : +d.subTitleWidth,
                                                time:       +d.stageStart
                                            }
                                        }),
                    overlays:       data.filter(d => d.scene === scene && d.overlayID !=='')
                                        .map( d => {
                                            return {
                                                id:          d.overlayID,
                                                text:        d.overlayText,
                                                x:          0,
                                                y:          0,
                                                width:      +d.overlayWidth  === 0 ? null : +d.overlayWidth ,
                                                time:       +d.stageStart
                                            }
                                        }),
                    labels:         data.filter(d => d.scene === scene && d.labelID !=='')
                                        .map( d => {
                                            return {
                                                id:          d.labelID,
                                                text:        d.labelText,
                                                x:          0,
                                                y:          0,
                                                width:      +d.labelWidth  === 0 ? null : +d.labelWidth ,
                                                time:       +d.stageStart
                                            }
                                        }),
                } 

                // e.  Create SVG text elements for "subTitle", "overlayText" and "label"
                if(Object.values(annotation.data[scene]).flat().length > 0){

                    const sceneGroup = d3.select('#annotation-group').append('g').attr('id', `annotations-${scene}`)
                    for( const type of annotation.types){
                        if(annotation.data[scene][type].length > 0){
                            const typeGroup = sceneGroup.append('g').attr('class', `annotations-${type}`)

                            for( const d of annotation.data[scene][type] ){
                                if(textElIDs.indexOf(d.id) < 0){    // Check for unique text id
                                    textElIDs.push(d.id) 

                                    // f. Render SVG element 
                                    const group = typeGroup.append('g')
                                    const el = group.append('text')
                                        .classed(type, true)
                                        .attr('dy', 0)
                                        .text(d.text)
                                        .call(textWrap, d.width, 1.15 )

                                    // g. Add object to TheatreJS
                                    anim.objBySheet[sheet][d.id] = anim.sheet[sheet].object(d.id, {
                                        x:          0,
                                        y:          0,
                                        opacity:    core.types.number(0, { range: [0, 1] })
                                    })

                                    // Add animatable attributes
                                    anim.objBySheet[sheet][d.id].onValuesChange((obj) => {
                                        group.node().style.transform = `translate(${obj.x + d.x}px, ${obj.y + d.y}px)`
                                        group.node().style.opacity = obj.opacity  
                                    })

                                } 
                            }
                        }
                    }
                }
            }   
        }
    }




/////////////////////////////////
/// IV. ADD PLAYBACK METHODS  ///
/////////////////////////////////


    anim.controls.playPause = (sheetName, range) => {
        if (state.animation.sheet[sheetName].isPlaying) {
            anim.sheet[sheetName].sequence.pause()
            anim.sheet.loop.sequence.pause()
        } else {
            anim.sheet[sheetName].sequence.play({ range })
            anim.sheet.loop.sequence.play()
        }
        state.animation.sheet[sheetName].isPlaying = !state.animation.sheet[sheetName].isPlaying
    };

    anim.controls.restart = (sheetName) => {
        anim.sheet[sheetName].sequence.position = 0
        state.animation.sheet[sheetName].isPlaying = false
        anim.controls.playPause(sheetName)

    };


////////////////////////////////////////////
/// V. ADD EVENT LISTENERS FOR PLAYBACK  ///
////////////////////////////////////////////

    switch(settings.ui.type){
        case 'scroll':
            window.scrollTo(0, 0)           // 
            document.body.style.height  = `${animState.sheetsById.main.sequence.length * settings.scroll.pixelsPerSecond}px`
            window.addEventListener('scroll', function(){
                anim.sheet.main.sequence.position = this.scrollY / settings.scroll.pixelsPerSecond
            })
            document.querySelector('.controls-container').classList.add('hidden')

            break

        case 'buttons':
        default:
            document.getElementById('btn-play-pause').addEventListener('click', function(){
                anim.controls.playPause('main')
                this.innerHTML =  state.animation.sheet.main.isPlaying ? 'Pause' : 'Play'
            })

            document.getElementById('btn-restart').addEventListener('click', () => {
                anim.controls.restart('main')
            })
    }


////////////////////////////////////////////
/// VI. ADDITIONAL SETUP                ///
////////////////////////////////////////////

    if (typeof studio !== 'undefined') { // Initialise studio 
        // Fix for TheatreJS studio UI
        setTimeout(() => {
            const el = document.getElementById('theatrejs-studio-root').shadowRoot.querySelector('.hySSSN')
            if(el){
                el.style.pointerEvents = 'all'
                el.style.height = '90vh'
                el.style.overflow = 'scroll'
                console.log('Fixed scrollable list')
            }

            anim.sheet.loop.sequence.play({iterationCount: Infinity})
        }, 500);
    }


/////////////////////////////
/// X. HELPER FUNCTIONS   ///
/////////////////////////////

    // SVG text wrapping
    function textWrap(text, width, lineHeight){
        width = width ? width : 1080
        text.each(function() {
            let text = d3.select(this),
                words = text.text().split(/\s+/).reverse(),
                word,
                line = [],
                lineNumber = 0,
                y = text.attr("y") ? text.attr("y") : 0,
                x = text.attr("x") ? text.attr("x") : 0,
                fontSize = parseFloat(text.style("font-size")),
                dy = parseFloat(text.attr("dy")),
                tspan = text.text(null).append("tspan").attr("x", x).attr("y", y).attr("dy", dy + "em");

            while (word = words.pop()) {
                line.push(word);
                tspan.text(line.join(" "));

                if (tspan.node().getComputedTextLength() > width) {
                    line.pop();
                    tspan.text(line.join(" "));
                    line = [word];
                    tspan = text.append("tspan")
                        .attr("x", x)
                        .attr("y",  y)
                        .attr("dy", ++lineNumber * +lineHeight + dy + "em").text(word);
                }                    
            }            
        })
    } // end wrap()
