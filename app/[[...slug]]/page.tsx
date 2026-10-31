import {settings} from '../../lib/server';
import Platform from '../platform';export default async function Page({params}:{params:Promise<{slug?:string[]}>}){const {slug=[]}=await params;return <Platform initialPath={'/'+slug.join('/')}/>}
export async function generateMetadata(){const config=await settings();return {title:(config.brand||'Meridian Press')+' | Independent publishing',description:'Write, publish and share your story. Publishing tools for authors, readers and staff.'}}
