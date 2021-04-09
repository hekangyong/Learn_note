import _ from 'lodash'
import './style.css'
import Icon from './icon.jpg'
import Bb from './b'

function createrElement() {
    const element = document.createElement('div')
    element.innerHTML = _.join(['hello', 'q3aaswed'], ' ')
    element.classList.add('hello')

    const image = new Image()
    image.src = Icon

    element.appendChild(image)

    return element
}

console.log('hey a.js')

document.body.appendChild(createrElement())

if (module.hot) {
    module.hot.accept('./b.js', () => {
        console.log('hehehehehehhehehehe')
        Bb()
    })
}
