import { error } from "console";
import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {

    try {
        console.log("show check it work or not");


        return NextResponse.json({
            message: "Test Next js first route work or not",
            success: true,
            data: "Parveen welcome in Next js"
        })
    } catch (error) {
        return NextResponse.json(
            {
                message: "server error",
                success: false,
                error: error
            },
            { status: 500 }
        )



    }
}

export async function POST(req:NextRequest){
    try {
        // const {id} = req.pa 
    } catch (error) {
       const message = error instanceof Error ? error?.message : String(error)
        return NextResponse.json({
            message:"Server error",
            success:false,
            error:message
        })
    }
}